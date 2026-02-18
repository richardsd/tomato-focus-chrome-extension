import CoreInterfaces
import DesignSystem
import SwiftUI

public enum TaskListFilter: String, CaseIterable {
    case all = "All"
    case inProgress = "In Progress"
    case completed = "Completed"

    public func matches(_ task: TaskItem) -> Bool {
        switch self {
        case .all:
            return true
        case .inProgress:
            return !task.isCompleted
        case .completed:
            return task.isCompleted
        }
    }
}

@MainActor
public final class TasksViewModel: ObservableObject {
    @Published public private(set) var tasks: [TaskItem] = []
    @Published public private(set) var currentTaskID: UUID?
    @Published public var draftTitle = ""
    @Published public var draftDetails = ""
    @Published public var draftEstimate = "1"
    @Published public private(set) var editingTaskID: UUID?

    public func filteredTasks(for filter: TaskListFilter) -> [TaskItem] {
        tasks.filter { filter.matches($0) }
    }

    public var allCount: Int {
        tasks.count
    }

    public var inProgressCount: Int {
        tasks.filter { !$0.isCompleted }.count
    }

    public var completedCount: Int {
        tasks.filter(\.isCompleted).count
    }

    private let storage: StorageServicing
    private let jira: JiraServicing
    private var observers: [NSObjectProtocol] = []

    public init(storage: StorageServicing, jira: JiraServicing) {
        self.storage = storage
        self.jira = jira
        reloadFromStorage()
        setupObservers()
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    public func beginCreate() {
        editingTaskID = nil
        draftTitle = ""
        draftDetails = ""
        draftEstimate = "1"
    }

    public func beginEdit(_ task: TaskItem) {
        editingTaskID = task.id
        draftTitle = task.title
        draftDetails = task.details
        draftEstimate = String(task.estimatedPomodoros)
    }

    public func cancelEditing() {
        beginCreate()
    }

    public func saveDraft() {
        let cleanedTitle = draftTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedTitle.isEmpty else { return }

        let estimate = max(Int(draftEstimate) ?? 1, 1)
        let cleanedDetails = draftDetails.trimmingCharacters(in: .whitespacesAndNewlines)

        if let editingTaskID,
           let index = tasks.firstIndex(where: { $0.id == editingTaskID }) {
            tasks[index].title = cleanedTitle
            tasks[index].details = cleanedDetails
            tasks[index].estimatedPomodoros = estimate
            storage.saveTasks(tasks)
        } else {
            tasks.append(
                TaskItem(
                    title: cleanedTitle,
                    details: cleanedDetails,
                    estimatedPomodoros: estimate
                )
            )
            storage.saveTasks(tasks)
        }

        beginCreate()
        reloadFromStorage()
    }

    public func toggleCurrentTask(_ task: TaskItem) {
        let nextID: UUID? = currentTaskID == task.id ? nil : task.id
        currentTaskID = nextID
        storage.saveCurrentTaskID(nextID)
    }

    public func toggleTaskCompletion(_ task: TaskItem) {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else { return }

        tasks[index].isCompleted.toggle()
        tasks[index].completedAt = tasks[index].isCompleted ? Date() : nil

        if tasks[index].isCompleted, currentTaskID == task.id {
            currentTaskID = nil
            storage.saveCurrentTaskID(nil)
        }

        storage.saveTasks(tasks)
        reloadFromStorage()
    }

    public func deleteTask(_ task: TaskItem) {
        tasks.removeAll { $0.id == task.id }

        if currentTaskID == task.id {
            currentTaskID = nil
            storage.saveCurrentTaskID(nil)
        }

        storage.saveTasks(tasks)
        reloadFromStorage()
    }

    public func clearCompletedTasks() {
        let hasCurrentCompletedTask = tasks.contains {
            $0.id == currentTaskID && $0.isCompleted
        }

        tasks.removeAll(where: \.isCompleted)
        storage.saveTasks(tasks)

        if hasCurrentCompletedTask {
            currentTaskID = nil
            storage.saveCurrentTaskID(nil)
        }

        reloadFromStorage()
    }

    public func importFromJira() async {
        guard let imported = try? await jira.fetchAssignedIssues() else { return }

        let existingTitles = Set(tasks.map { $0.title.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) })
        let unique = imported.filter {
            !existingTitles.contains($0.title.lowercased().trimmingCharacters(in: .whitespacesAndNewlines))
        }

        guard !unique.isEmpty else { return }

        tasks.append(contentsOf: unique)
        storage.saveTasks(tasks)
        reloadFromStorage()
    }

    private func setupObservers() {
        let tasksObserver = NotificationCenter.default.addObserver(
            forName: .tasksDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.reloadFromStorage()
            }
        }

        let currentTaskObserver = NotificationCenter.default.addObserver(
            forName: .currentTaskDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.reloadFromStorage()
            }
        }

        observers = [tasksObserver, currentTaskObserver]
    }

    private func reloadFromStorage() {
        tasks = storage.loadTasks()
        currentTaskID = storage.loadCurrentTaskID()

        if let currentTaskID,
           !tasks.contains(where: { $0.id == currentTaskID }) {
            self.currentTaskID = nil
            storage.saveCurrentTaskID(nil)
        }
    }
}

public struct TasksView: View {
    @ObservedObject private var viewModel: TasksViewModel
    @State private var activeFilter: TaskListFilter = .all

    public init(viewModel: TasksViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DSSpacing.lg) {
                taskCaptureCard
                filterCard

                if viewModel.filteredTasks(for: activeFilter).isEmpty {
                    emptyState
                } else {
                    LazyVStack(alignment: .leading, spacing: DSSpacing.sm) {
                        ForEach(viewModel.filteredTasks(for: activeFilter)) { task in
                            taskRow(task)
                        }
                    }
                }
            }
            .padding(DSSpacing.xl)
            .frame(maxWidth: 980, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(DSColor.pageBackground.ignoresSafeArea())
        .onAppear {
            viewModel.beginCreate()
        }
    }

    private var taskCaptureCard: some View {
        VStack(alignment: .leading, spacing: DSSpacing.md) {
            HStack {
                VStack(alignment: .leading, spacing: DSSpacing.xxs) {
                    Text(viewModel.editingTaskID == nil ? "Quick Capture" : "Edit Task")
                        .font(DSTypography.subtitle)
                    Text("Keep sessions focused by defining your next outcomes.")
                        .font(.subheadline)
                        .foregroundStyle(DSColor.secondaryText)
                }

                Spacer()

                Button("Import Jira") {
                    Task { await viewModel.importFromJira() }
                }
                .buttonStyle(DSSecondaryButtonStyle())
            }

            TextField("Task title", text: $viewModel.draftTitle)
                .textFieldStyle(.roundedBorder)

            TextField("Description (optional)", text: $viewModel.draftDetails)
                .textFieldStyle(.roundedBorder)

            HStack(spacing: DSSpacing.sm) {
                VStack(alignment: .leading, spacing: DSSpacing.xxs) {
                    Text("Estimate")
                        .font(.caption)
                        .foregroundStyle(DSColor.secondaryText)
                    TextField("1", text: $viewModel.draftEstimate)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 80)
                }

                Text("focus sessions")
                    .font(.subheadline)
                    .foregroundStyle(DSColor.secondaryText)

                Spacer()

                if viewModel.editingTaskID != nil {
                    Button("Cancel") {
                        viewModel.cancelEditing()
                    }
                    .buttonStyle(DSSecondaryButtonStyle())
                }

                Button(viewModel.editingTaskID == nil ? "Add Task" : "Update Task") {
                    viewModel.saveDraft()
                }
                .buttonStyle(DSPrimaryButtonStyle())
                .disabled(viewModel.draftTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .dsCard()
    }

    private var filterCard: some View {
        HStack(spacing: DSSpacing.md) {
            Picker("Filter", selection: $activeFilter) {
                Text("All (\(viewModel.allCount))").tag(TaskListFilter.all)
                Text("In Progress (\(viewModel.inProgressCount))").tag(TaskListFilter.inProgress)
                Text("Completed (\(viewModel.completedCount))").tag(TaskListFilter.completed)
            }
            .pickerStyle(.segmented)

            Spacer()

            if activeFilter == .completed, viewModel.completedCount > 0 {
                Button("Clear Completed") {
                    viewModel.clearCompletedTasks()
                }
                .buttonStyle(DSDestructiveButtonStyle())
            }
        }
        .dsCard()
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: DSSpacing.xs) {
            Text("No tasks in this filter")
                .font(DSTypography.subtitle)
            Text("Create a new task or switch filters to see existing work items.")
                .foregroundStyle(DSColor.secondaryText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .dsCard()
    }

    private func taskRow(_ task: TaskItem) -> some View {
        VStack(alignment: .leading, spacing: DSSpacing.sm) {
            HStack(alignment: .top, spacing: DSSpacing.sm) {
                Button {
                    viewModel.toggleTaskCompletion(task)
                } label: {
                    Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(task.isCompleted ? DSColor.focus : DSColor.secondaryText)
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: DSSpacing.xxs) {
                    Text(task.title)
                        .font(.headline)
                        .strikethrough(task.isCompleted)

                    if !task.details.isEmpty {
                        Text(task.details)
                            .font(.subheadline)
                            .foregroundStyle(DSColor.secondaryText)
                    }

                    HStack(spacing: DSSpacing.xs) {
                        Label("\(task.completedPomodoros)/\(task.estimatedPomodoros)", systemImage: "timer")
                            .font(.caption)
                            .foregroundStyle(task.isCompleted ? DSColor.secondaryText : DSColor.focus)

                        if viewModel.currentTaskID == task.id {
                            Label("Current", systemImage: "scope")
                                .font(.caption)
                                .padding(.horizontal, DSSpacing.xs)
                                .padding(.vertical, DSSpacing.xxs)
                                .background(DSColor.focus.opacity(0.16), in: Capsule(style: .continuous))
                                .foregroundStyle(DSColor.focus)
                        }
                    }
                }

                Spacer()
            }

            HStack(spacing: DSSpacing.xs) {
                Button(viewModel.currentTaskID == task.id ? "Unset Current" : "Set Current") {
                    viewModel.toggleCurrentTask(task)
                }
                .buttonStyle(DSSecondaryButtonStyle())

                Button("Edit") {
                    viewModel.beginEdit(task)
                }
                .buttonStyle(DSSecondaryButtonStyle())

                Button("Delete") {
                    viewModel.deleteTask(task)
                }
                .buttonStyle(DSDestructiveButtonStyle())
            }
            .font(.caption)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(DSSpacing.md)
        .background(
            RoundedRectangle(cornerRadius: DSRadius.medium, style: .continuous)
                .fill(viewModel.currentTaskID == task.id ? DSColor.focus.opacity(0.10) : DSColor.cardBackground.opacity(0.72))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DSRadius.medium, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
        )
    }
}
