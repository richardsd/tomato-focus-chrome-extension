import CoreInterfaces
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
    @Published public var activeFilter: TaskListFilter = .all
    @Published public private(set) var editingTaskID: UUID?

    public var filteredTasks: [TaskItem] {
        tasks.filter { activeFilter.matches($0) }
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
            self?.reloadFromStorage()
        }

        let currentTaskObserver = NotificationCenter.default.addObserver(
            forName: .currentTaskDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.reloadFromStorage()
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

    public init(viewModel: TasksViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                TextField("Task title", text: $viewModel.draftTitle)
                TextField("Description (optional)", text: $viewModel.draftDetails)

                HStack {
                    TextField("Estimate", text: $viewModel.draftEstimate)
                        .frame(width: 80)
                    Text("focus sessions")
                        .foregroundStyle(.secondary)

                    Spacer()

                    Button(viewModel.editingTaskID == nil ? "Add" : "Update") {
                        viewModel.saveDraft()
                    }
                    .disabled(viewModel.draftTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    if viewModel.editingTaskID != nil {
                        Button("Cancel") {
                            viewModel.cancelEditing()
                        }
                    }

                    Button("Import Jira") {
                        Task { await viewModel.importFromJira() }
                    }
                }
            }

            HStack {
                ForEach(TaskListFilter.allCases, id: \.self) { filter in
                    Button {
                        viewModel.activeFilter = filter
                    } label: {
                        Text(filterLabel(for: filter))
                    }
                    .buttonStyle(.bordered)
                    .tint(viewModel.activeFilter == filter ? .accentColor : .clear)
                }

                Spacer()

                if viewModel.activeFilter == .completed, viewModel.completedCount > 0 {
                    Button("Clear completed") {
                        viewModel.clearCompletedTasks()
                    }
                }
            }

            List(viewModel.filteredTasks) { task in
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Button {
                            viewModel.toggleTaskCompletion(task)
                        } label: {
                            Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                        }
                        .buttonStyle(.plain)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(task.title)
                                .strikethrough(task.isCompleted)

                            if !task.details.isEmpty {
                                Text(task.details)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }

                        Spacer()

                        Text("🍅 \(task.completedPomodoros)/\(task.estimatedPomodoros)")
                            .foregroundStyle(task.isCompleted ? .secondary : .primary)
                    }

                    HStack {
                        Button(viewModel.currentTaskID == task.id ? "Unset Current" : "Set Current") {
                            viewModel.toggleCurrentTask(task)
                        }
                        .buttonStyle(.bordered)

                        Button("Edit") {
                            viewModel.beginEdit(task)
                        }
                        .buttonStyle(.bordered)

                        Button("Delete", role: .destructive) {
                            viewModel.deleteTask(task)
                        }
                        .buttonStyle(.bordered)
                    }
                    .font(.caption)
                }
                .padding(.vertical, 4)
                .listRowBackground(viewModel.currentTaskID == task.id ? Color.accentColor.opacity(0.12) : Color.clear)
            }
        }
        .padding()
        .onAppear {
            viewModel.beginCreate()
        }
    }

    private func filterLabel(for filter: TaskListFilter) -> String {
        switch filter {
        case .all:
            return "All (\(viewModel.allCount))"
        case .inProgress:
            return "In Progress (\(viewModel.inProgressCount))"
        case .completed:
            return "Completed (\(viewModel.completedCount))"
        }
    }
}
