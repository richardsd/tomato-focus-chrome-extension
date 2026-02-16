import CoreInterfaces
import SwiftUI

@MainActor
public final class TasksViewModel: ObservableObject {
    @Published public private(set) var tasks: [TaskItem] = []
    @Published public var draftTitle = ""

    private let storage: StorageServicing
    private let jira: JiraServicing

    public init(storage: StorageServicing, jira: JiraServicing) {
        self.storage = storage
        self.jira = jira
        self.tasks = storage.loadTasks()
    }

    public func addTask() {
        guard !draftTitle.isEmpty else { return }
        tasks.append(TaskItem(title: draftTitle))
        draftTitle = ""
        storage.saveTasks(tasks)
    }

    public func toggleTask(_ task: TaskItem) {
        guard let index = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        tasks[index].isDone.toggle()
        storage.saveTasks(tasks)
    }

    public func importFromJira() async {
        guard let imported = try? await jira.fetchAssignedIssues() else { return }
        tasks.append(contentsOf: imported)
        storage.saveTasks(tasks)
    }
}

public struct TasksView: View {
    @ObservedObject private var viewModel: TasksViewModel

    public init(viewModel: TasksViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                TextField("Add task", text: $viewModel.draftTitle)
                Button("Add", action: viewModel.addTask)
                Button("Import Jira") {
                    Task { await viewModel.importFromJira() }
                }
            }

            List(viewModel.tasks) { task in
                Button {
                    viewModel.toggleTask(task)
                } label: {
                    HStack {
                        Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                        Text(task.title)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding()
    }
}
