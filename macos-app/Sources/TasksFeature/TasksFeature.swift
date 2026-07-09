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
    @Published public private(set) var jiraImportStatusMessage = ""
    @Published public private(set) var jiraImportErrorMessage = ""
    @Published public private(set) var isJiraConfigured = false

    public func filteredTasks(for filter: TaskListFilter) -> [TaskItem] {
        tasks.filter { filter.matches($0) }
    }

    public func task(id: UUID?) -> TaskItem? {
        guard let id else { return nil }
        return tasks.first { $0.id == id }
    }

    public func canSetCurrent(_ task: TaskItem) -> Bool {
        !task.isCompleted
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

    public var jiraImportDisabledReason: String {
        "Import Jira is disabled. Configure Jira URL, username, and API token in Settings > Jira Integration."
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

    @discardableResult
    public func saveDraft() -> UUID? {
        let cleanedTitle = draftTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanedTitle.isEmpty else { return nil }

        let estimate = max(Int(draftEstimate) ?? 1, 1)
        let cleanedDetails = draftDetails.trimmingCharacters(in: .whitespacesAndNewlines)
        let savedTaskID: UUID

        if let editingTaskID,
           let index = tasks.firstIndex(where: { $0.id == editingTaskID }) {
            tasks[index].title = cleanedTitle
            tasks[index].details = cleanedDetails
            tasks[index].estimatedPomodoros = estimate
            savedTaskID = editingTaskID
            storage.saveTasks(tasks)
        } else {
            let task = TaskItem(
                title: cleanedTitle,
                details: cleanedDetails,
                estimatedPomodoros: estimate
            )
            savedTaskID = task.id
            tasks.append(task)
            storage.saveTasks(tasks)
        }

        beginCreate()
        reloadFromStorage()
        return savedTaskID
    }

    public func toggleCurrentTask(_ task: TaskItem) {
        guard canSetCurrent(task) || currentTaskID == task.id else { return }

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
        jiraImportStatusMessage = ""
        jiraImportErrorMessage = ""

        do {
            let imported = try await jira.fetchAssignedIssues()
            let existingTitles = Set(tasks.map { $0.title.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) })
            let unique = imported.filter {
                !existingTitles.contains($0.title.lowercased().trimmingCharacters(in: .whitespacesAndNewlines))
            }

            guard !unique.isEmpty else {
                jiraImportStatusMessage = "No new Jira issues to import."
                return
            }

            tasks.append(contentsOf: unique)
            storage.saveTasks(tasks)
            reloadFromStorage()
            jiraImportStatusMessage = "Imported \(unique.count) Jira issue\(unique.count == 1 ? "" : "s")."
        } catch {
            jiraImportErrorMessage = error.localizedDescription
        }
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

        let settingsObserver = NotificationCenter.default.addObserver(
            forName: .settingsDidChange,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.reloadFromStorage()
            }
        }

        observers = [tasksObserver, currentTaskObserver, settingsObserver]
    }

    private func reloadFromStorage() {
        tasks = storage.loadTasks()
        currentTaskID = storage.loadCurrentTaskID()
        refreshJiraConfigurationState()

        if let currentTaskID,
           !tasks.contains(where: { $0.id == currentTaskID }) {
            self.currentTaskID = nil
            storage.saveCurrentTaskID(nil)
        }
    }

    private func refreshJiraConfigurationState() {
        let settings = storage.loadSettings()
        isJiraConfigured = !settings.jiraURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !settings.jiraUsername.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !settings.jiraToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

public struct TasksView: View {
    @ObservedObject private var viewModel: TasksViewModel
    @State private var activeFilter: TaskListFilter = .all
    @State private var selectedTaskID: UUID?
    @State private var isComposingNewTask = false

    public init(viewModel: TasksViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        HStack(spacing: 0) {
            taskListPane
                .frame(width: 330)

            Divider()

            taskDetailPane
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DSColor.pageBackground.ignoresSafeArea())
        .onAppear {
            if viewModel.tasks.isEmpty {
                startNewTask()
            } else {
                syncSelectionWithFilter()
            }
        }
        .onChange(of: activeFilter) { _ in
            syncSelectionWithFilter()
        }
        .onChange(of: viewModel.tasks) { _ in
            syncSelectionWithFilter()
        }
        .onChange(of: selectedTaskID) { id in
            guard id != nil else { return }
            isComposingNewTask = false
            if viewModel.editingTaskID != id {
                viewModel.cancelEditing()
            }
        }
    }

    private var estimateValueBinding: Binding<Int> {
        Binding(
            get: { max(Int(viewModel.draftEstimate) ?? 1, 1) },
            set: { newValue in
                viewModel.draftEstimate = String(max(newValue, 1))
            }
        )
    }

    private var filteredTasks: [TaskItem] {
        viewModel.filteredTasks(for: activeFilter)
    }

    private var selectedTask: TaskItem? {
        viewModel.task(id: selectedTaskID)
    }

    private var taskListPane: some View {
        VStack(alignment: .leading, spacing: DSSpacing.sm) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: DSSpacing.xxs) {
                    Text("Tasks")
                        .font(DSTypography.title)
                    Text("\(viewModel.inProgressCount) active, \(viewModel.completedCount) completed")
                        .font(.caption)
                        .foregroundStyle(DSColor.secondaryText)
                }

                Spacer()

                Button {
                    startNewTask()
                } label: {
                    Label("New", systemImage: "plus")
                }
                .buttonStyle(DSPrimaryButtonStyle())
            }

            Picker("Filter", selection: $activeFilter) {
                Text("All (\(viewModel.allCount))").tag(TaskListFilter.all)
                Text("Active (\(viewModel.inProgressCount))").tag(TaskListFilter.inProgress)
                Text("Done (\(viewModel.completedCount))").tag(TaskListFilter.completed)
            }
            .pickerStyle(.segmented)

            if filteredTasks.isEmpty {
                emptyListState
            } else {
                List(selection: $selectedTaskID) {
                    ForEach(filteredTasks) { task in
                        taskListRow(task)
                            .tag(task.id)
                    }
                }
                .listStyle(.inset)
            }

            VStack(alignment: .leading, spacing: DSSpacing.xs) {
                Button("Import Jira") {
                    Task {
                        await viewModel.importFromJira()
                        syncSelectionWithFilter()
                    }
                }
                .buttonStyle(DSSecondaryButtonStyle())
                .disabled(!viewModel.isJiraConfigured)
                .help(viewModel.isJiraConfigured ? "Import assigned unresolved Jira issues." : viewModel.jiraImportDisabledReason)

                if activeFilter == .completed, viewModel.completedCount > 0 {
                    Button("Clear Completed") {
                        viewModel.clearCompletedTasks()
                        syncSelectionWithFilter()
                    }
                    .buttonStyle(DSDestructiveButtonStyle())
                }

                if !viewModel.jiraImportErrorMessage.isEmpty {
                    Text(viewModel.jiraImportErrorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                } else if !viewModel.jiraImportStatusMessage.isEmpty {
                    Text(viewModel.jiraImportStatusMessage)
                        .font(.caption)
                        .foregroundStyle(DSColor.focus)
                }
            }
        }
        .padding(DSSpacing.lg)
    }

    private var taskDetailPane: some View {
        Group {
            if isComposingNewTask || viewModel.editingTaskID != nil {
                taskEditor
            } else if let selectedTask {
                taskDetail(selectedTask)
            } else {
                emptyDetailState
            }
        }
        .padding(DSSpacing.xl)
    }

    private var emptyListState: some View {
        VStack(alignment: .leading, spacing: DSSpacing.xs) {
            Text("No tasks in this filter")
                .font(DSTypography.subtitle)
            Text("Create a task or switch filters to see existing work.")
                .foregroundStyle(DSColor.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.vertical, DSSpacing.lg)
    }

    private var emptyDetailState: some View {
        VStack(alignment: .leading, spacing: DSSpacing.sm) {
            Image(systemName: "checklist")
                .font(.largeTitle)
                .foregroundStyle(DSColor.secondaryText)

            Text("Select a task")
                .font(DSTypography.subtitle)
            Text("Choose a task from the list or create a new one.")
                .foregroundStyle(DSColor.secondaryText)

            Button("New Task") {
                startNewTask()
            }
            .buttonStyle(DSPrimaryButtonStyle())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }

    private func taskListRow(_ task: TaskItem) -> some View {
        HStack(spacing: DSSpacing.sm) {
            Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(task.isCompleted ? DSColor.focus : DSColor.secondaryText)
                .frame(width: 18)

            VStack(alignment: .leading, spacing: DSSpacing.xxs) {
                HStack(spacing: DSSpacing.xs) {
                    Text(task.title)
                        .lineLimit(1)
                        .strikethrough(task.isCompleted)

                    if viewModel.currentTaskID == task.id {
                        Image(systemName: "scope")
                            .font(.caption)
                            .foregroundStyle(DSColor.focus)
                            .help("Current task")
                    }
                }

                HStack(spacing: DSSpacing.xs) {
                    Text("\(task.completedPomodoros)/\(task.estimatedPomodoros) sessions")
                    if task.isCompleted {
                        Text("Completed")
                    }
                }
                .font(.caption)
                .foregroundStyle(DSColor.secondaryText)
            }

            Spacer()
        }
        .padding(.vertical, DSSpacing.xxs)
        .contentShape(Rectangle())
    }

    private var taskEditor: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DSSpacing.lg) {
                VStack(alignment: .leading, spacing: DSSpacing.xxs) {
                    Text(viewModel.editingTaskID == nil ? "New Task" : "Edit Task")
                        .font(DSTypography.title)
                    Text("Define the next outcome before starting a focus session.")
                        .foregroundStyle(DSColor.secondaryText)
                }

                VStack(alignment: .leading, spacing: DSSpacing.sm) {
                    TextField("Task title", text: $viewModel.draftTitle)
                        .textFieldStyle(.roundedBorder)

                    VStack(alignment: .leading, spacing: DSSpacing.xxs) {
                        Text("Description")
                            .font(.caption)
                            .foregroundStyle(DSColor.secondaryText)
                        TextEditor(text: $viewModel.draftDetails)
                            .font(.body)
                            .frame(minHeight: 110)
                            .overlay(
                                RoundedRectangle(cornerRadius: DSRadius.small, style: .continuous)
                                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
                            )
                    }

                    HStack(spacing: DSSpacing.xs) {
                        Text("Estimate")
                            .frame(width: 88, alignment: .leading)
                        TextField("1", text: $viewModel.draftEstimate)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 90)
                        Stepper("", value: estimateValueBinding, in: 1...999)
                            .labelsHidden()
                        Text("focus sessions")
                            .foregroundStyle(DSColor.secondaryText)
                    }
                }
                .frame(maxWidth: 560, alignment: .leading)

                HStack(spacing: DSSpacing.sm) {
                    Button(viewModel.editingTaskID == nil ? "Add Task" : "Update Task") {
                        saveDraftAndSelect()
                    }
                    .buttonStyle(DSPrimaryButtonStyle())
                    .disabled(viewModel.draftTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    Button("Cancel") {
                        cancelEditing()
                    }
                    .buttonStyle(DSSecondaryButtonStyle())
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func taskDetail(_ task: TaskItem) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DSSpacing.lg) {
                VStack(alignment: .leading, spacing: DSSpacing.xs) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(task.title)
                            .font(DSTypography.title)
                            .strikethrough(task.isCompleted)
                        Spacer()
                        if viewModel.currentTaskID == task.id {
                            Label("Current", systemImage: "scope")
                                .font(.caption.weight(.medium))
                                .padding(.horizontal, DSSpacing.xs)
                                .padding(.vertical, DSSpacing.xxs)
                                .background(DSColor.focus.opacity(0.16), in: Capsule(style: .continuous))
                                .foregroundStyle(DSColor.focus)
                        }
                    }

                    Text(task.isCompleted ? "Completed task" : "Active task")
                        .foregroundStyle(DSColor.secondaryText)
                }

                if !task.details.isEmpty {
                    VStack(alignment: .leading, spacing: DSSpacing.xs) {
                        Text("Description")
                            .font(DSTypography.subtitle)
                        Text(task.details)
                            .foregroundStyle(DSColor.secondaryText)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .dsCard()
                }

                HStack(spacing: DSSpacing.sm) {
                    DSMetricCard(
                        title: "Completed",
                        value: String(task.completedPomodoros),
                        symbol: "timer",
                        tint: DSColor.focus
                    )
                    DSMetricCard(
                        title: "Estimate",
                        value: String(task.estimatedPomodoros),
                        symbol: "target",
                        tint: DSColor.shortBreak
                    )
                }

                HStack(spacing: DSSpacing.sm) {
                    Button(task.isCompleted ? "Reopen Task" : "Complete Task") {
                        viewModel.toggleTaskCompletion(task)
                        syncSelectionWithFilter()
                    }
                    .buttonStyle(DSSecondaryButtonStyle())

                    if viewModel.canSetCurrent(task) {
                        Button(viewModel.currentTaskID == task.id ? "Unset Current" : "Set Current") {
                            viewModel.toggleCurrentTask(task)
                        }
                        .buttonStyle(DSSecondaryButtonStyle())
                    }

                    Button("Edit") {
                        selectedTaskID = task.id
                        isComposingNewTask = false
                        viewModel.beginEdit(task)
                    }
                    .buttonStyle(DSSecondaryButtonStyle())

                    Button("Delete") {
                        deleteTask(task)
                    }
                    .buttonStyle(DSDestructiveButtonStyle())
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func startNewTask() {
        activeFilter = .all
        selectedTaskID = nil
        isComposingNewTask = true
        viewModel.beginCreate()
    }

    private func saveDraftAndSelect() {
        guard let savedTaskID = viewModel.saveDraft() else { return }
        selectedTaskID = savedTaskID
        isComposingNewTask = false
    }

    private func cancelEditing() {
        let wasCreating = isComposingNewTask
        isComposingNewTask = false
        viewModel.cancelEditing()

        if wasCreating {
            syncSelectionWithFilter()
        }
    }

    private func deleteTask(_ task: TaskItem) {
        viewModel.deleteTask(task)
        if selectedTaskID == task.id {
            selectedTaskID = nil
        }
        syncSelectionWithFilter()
    }

    private func syncSelectionWithFilter() {
        guard !isComposingNewTask else { return }

        if let editingTaskID = viewModel.editingTaskID,
           filteredTasks.contains(where: { $0.id == editingTaskID }) {
            selectedTaskID = editingTaskID
            return
        }

        if let selectedTaskID,
           filteredTasks.contains(where: { $0.id == selectedTaskID }) {
            return
        }

        selectedTaskID = filteredTasks.first?.id

        if selectedTaskID == nil {
            viewModel.cancelEditing()
        }
    }
}
