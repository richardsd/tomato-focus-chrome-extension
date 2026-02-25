import CoreInterfaces
import Foundation

public enum JiraServiceError: LocalizedError {
    case missingConfiguration
    case invalidURL
    case authenticationFailed
    case networkFailure(String)
    case requestFailed(status: Int, message: String?)
    case invalidResponse

    public var errorDescription: String? {
        switch self {
        case .missingConfiguration:
            return "Jira URL, username, and API token are required."
        case .invalidURL:
            return "Jira URL must be an https://<your-domain>.atlassian.net or https://<your-domain>.jira.com URL."
        case .authenticationFailed:
            return "Jira authentication failed. Check your Jira URL, username, and API token."
        case let .networkFailure(message):
            return "Failed to connect to Jira: \(message)"
        case let .requestFailed(status, message):
            if let message, !message.isEmpty {
                return "Jira request failed (\(status)): \(message)"
            }
            return "Jira request failed (\(status))."
        case .invalidResponse:
            return "Jira response was not valid JSON."
        }
    }
}

public struct JiraService: JiraServicing {
    private let storage: StorageServicing
    private let session: URLSession

    public init(storage: StorageServicing, session: URLSession = .shared) {
        self.storage = storage
        self.session = session
    }

    public func fetchAssignedIssues() async throws -> [TaskItem] {
        let settings = storage.loadSettings()
        let jiraURL = settings.jiraURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let jiraUsername = settings.jiraUsername.trimmingCharacters(in: .whitespacesAndNewlines)
        let jiraToken = settings.jiraToken.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !jiraURL.isEmpty, !jiraUsername.isEmpty, !jiraToken.isEmpty else {
            throw JiraServiceError.missingConfiguration
        }
        guard isValidJiraURL(jiraURL) else {
            throw JiraServiceError.invalidURL
        }

        let escapedUsername = jiraUsername
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        let jql = #"status in ("Open","In Progress","In Review","Verify") AND assignee = "\#(escapedUsername)" AND resolution = Unresolved"#
        let fields = "key,summary,description"
        let baseURL = jiraURL.replacingOccurrences(of: "/$", with: "", options: .regularExpression)
        guard
            let encodedJQL = jql.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
            let encodedFields = fields.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
            let endpoint = URL(string: "\(baseURL)/rest/api/3/search/jql?jql=\(encodedJQL)&fields=\(encodedFields)")
        else {
            throw JiraServiceError.invalidURL
        }

        var request = URLRequest(url: endpoint)
        request.timeoutInterval = 20
        request.addValue("application/json", forHTTPHeaderField: "Accept")
        let authData = Data("\(jiraUsername):\(jiraToken)".utf8).base64EncodedString()
        request.addValue("Basic \(authData)", forHTTPHeaderField: "Authorization")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw JiraServiceError.networkFailure(error.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw JiraServiceError.invalidResponse
        }

        if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
            throw JiraServiceError.authenticationFailed
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8)
            throw JiraServiceError.requestFailed(status: httpResponse.statusCode, message: message)
        }

        let decoded: JiraSearchResponse
        do {
            decoded = try JSONDecoder().decode(JiraSearchResponse.self, from: data)
        } catch {
            throw JiraServiceError.invalidResponse
        }

        return decoded.issues.map { issue in
            let summary = issue.fields.summary?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let title = summary.isEmpty ? issue.key : summary
            let description = descriptionText(from: issue.fields.description).trimmingCharacters(in: .whitespacesAndNewlines)
            let details = description.isEmpty ? issue.key : "\(issue.key)\n\(description)"
            return TaskItem(title: title, details: details, estimatedPomodoros: 1)
        }
    }

    private func isValidJiraURL(_ rawURL: String) -> Bool {
        guard let url = URL(string: rawURL), url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else {
            return false
        }
        return host.hasSuffix(".atlassian.net") || host.hasSuffix(".jira.com")
    }

    private func descriptionText(from description: JiraIssueDescription?) -> String {
        guard let description else { return "" }
        switch description {
        case let .string(value):
            return value
        case let .document(document):
            return flattenedText(from: document.content)
        }
    }

    private func flattenedText(from nodes: [JiraDescriptionNode]) -> String {
        nodes
            .map { node in
                if let text = node.text {
                    return text
                }
                if let content = node.content {
                    return flattenedText(from: content)
                }
                return ""
            }
            .filter { !$0.isEmpty }
            .joined(separator: "\n")
    }
}

private struct JiraSearchResponse: Decodable {
    let issues: [JiraIssue]
}

private struct JiraIssue: Decodable {
    let key: String
    let fields: JiraIssueFields
}

private struct JiraIssueFields: Decodable {
    let summary: String?
    let description: JiraIssueDescription?
}

private enum JiraIssueDescription: Decodable {
    case string(String)
    case document(JiraDescriptionDocument)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self = .string(value)
            return
        }
        if let value = try? container.decode(JiraDescriptionDocument.self) {
            self = .document(value)
            return
        }
        throw DecodingError.typeMismatch(
            JiraIssueDescription.self,
            DecodingError.Context(
                codingPath: decoder.codingPath,
                debugDescription: "Expected Jira description as string or Atlassian document."
            )
        )
    }
}

private struct JiraDescriptionDocument: Decodable {
    let content: [JiraDescriptionNode]
}

private struct JiraDescriptionNode: Decodable {
    let text: String?
    let content: [JiraDescriptionNode]?
}
