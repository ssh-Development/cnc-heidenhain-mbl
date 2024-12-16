// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

let diagnosticCollection: vscode.DiagnosticCollection;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.commands.registerCommand('cnc-heidenhain.number', async () => {
		var editor = vscode.window.activeTextEditor;
		if (!editor) {
			return; // No open text editor
		}

		var document = editor.document;

		const cyclePattern = /~$/g;
		const lineNumberPattern = /^\s*[0-9]*\s*/g;

		editor.edit(eb => {
			var lineNumber = 1;
			var lastLine;
			for (var i = 0; i < document.lineCount; i++) {
				var line = document.lineAt(i);
				var match = line.text.match(lineNumberPattern);
				if (match) {
					if (lastLine) {
						if (!lastLine.text.match(cyclePattern)) {
							var range = new vscode.Range(i, 0, i, match[0].length);
							eb.replace(range, lineNumber + ' ');
							lineNumber++;
						}
					}
					else {
						var range = new vscode.Range(i, 0, i, match[0].length);
						eb.replace(range, lineNumber + ' ');
						lineNumber++;
					}

				}

				lastLine = line;
			}
		});
	}));

	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider("heidenhain", {
		provideDocumentSymbols(document: vscode.TextDocument,
			token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
			return new Promise((resolve, reject) => {
				var symbols: vscode.SymbolInformation[] = [];
				var qParams = [];
				var activeLabelSymbol;
				var lastToolCallSymbol;
				var lastLine;

				const outlinePattern = /^\s*[0-9]*\s*\*(.+)/i;
				const labelPattern = /^\s*[0-9]*\s*LBL\s+(\"\w+\"|[0-9]+)/i;
				const endLabelPattern = /^\s*[0-9]*\s*LBL\s+0/i;
				const toolCallPattern = /^\s*[0-9]*\s*TOOL\s+CALL\s+(\"\w+\"|[0-9]+|)/i;

				for (var i = 0; i < document.lineCount; i++) {
					var line = document.lineAt(i);

					var match = outlinePattern.exec(line.text);
					if (match) {
						var text = match[1];
						var outlineSymbol = new vscode.SymbolInformation(text, vscode.SymbolKind.Variable, "main", new vscode.Location(document.uri, line.range));
						symbols.push(outlineSymbol);
					}

					var match = labelPattern.exec(line.text);
					if (match) {
						var text = match[1];
						if (text != '0') {
							activeLabelSymbol = new vscode.SymbolInformation('LBL ' + text, vscode.SymbolKind.Method, "main", new vscode.Location(document.uri, line.range));
						}
					}

					var match = endLabelPattern.exec(line.text);
					if (match) {
						if (activeLabelSymbol) {
							activeLabelSymbol.location.range = new vscode.Range(activeLabelSymbol.location.range.start, line.range.end);
							symbols.push(activeLabelSymbol);
							activeLabelSymbol = null;
						}
					}

					var match = toolCallPattern.exec(line.text);
					if (match) {
						if(lastToolCallSymbol && lastLine)
						{
							lastToolCallSymbol.location.range = new vscode.Range(lastToolCallSymbol.location.range.start, lastLine.range.end);
						}

						var text = match[1];
						var symbol = new vscode.SymbolInformation('TOOL CALL ' + text, vscode.SymbolKind.Method, "main", new vscode.Location(document.uri, line.range));
						symbols.push(symbol);
						lastToolCallSymbol = symbol;
					}

					lastLine = line;
				}

				resolve(symbols);
			});
		}
	}));

	//#region Diagnostics

	diagnosticCollection = vscode.languages.createDiagnosticCollection('go');
	context.subscriptions.push(diagnosticCollection);

	if (vscode.window.activeTextEditor) {
		updateDiagnostics(vscode.window.activeTextEditor.document, diagnosticCollection);
	}

	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor) {
			updateDiagnostics(editor.document, diagnosticCollection);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(editor => {
		if (editor) {
			updateDiagnostics(editor.document, diagnosticCollection);
		}
	}));

	//#endregion



	const provider = new TextBlockViewProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(TextBlockViewProvider.viewType, provider));
}

class TextBlockViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'cnc-heidenhain.text-blocks-view';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'insertTextBlock':
					{
						vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
						break;
					}
			}
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));

		// Do the same for the stylesheet.
		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">

				<title>Cat Colors</title>
			</head>
			<body>
				<ul class="color-list">
				</ul>

				<button class="add-color-button">Add Color</button>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

function updateDiagnostics(document: vscode.TextDocument, collection: vscode.DiagnosticCollection): void {
	if (document)
		if (document.languageId == 'heidenhain') {

			collection.clear();
			var diagnostics: vscode.Diagnostic[] = [];

			var beginEndPgmName;

			const validBeginLinePattern = /^\s*[0-9]*\s*BEGIN\s+PGM\s+(\w+)\s+(MM|INCH)$/g;
			const validEndLinePattern = /^\s*[0-9]*\s*END\s+PGM\s+(\w+)\s+(MM|INCH)$/g;

			for (var i = 0; i < document.lineCount; i++) {
				var line = document.lineAt(i);
				var text = line.text.toUpperCase();

				if (i == 0) {
					var match = validBeginLinePattern.exec(text);
					if (!match) {
						diagnostics.push({
							code: undefined,
							message: 'BEGIN Satz hat falsches format!',
							range: line.range,
							severity: vscode.DiagnosticSeverity.Error,
							source: undefined,
							relatedInformation: undefined
						});
					}
					else {
						beginEndPgmName = match[1];
					}
				}

				if (i == document.lineCount - 1) {
					var match = validEndLinePattern.exec(text);
					if (!match) {
						diagnostics.push({
							code: undefined,
							message: 'END Satz hat falsches format!',
							range: line.range,
							severity: vscode.DiagnosticSeverity.Error,
							source: undefined,
							relatedInformation: undefined
						});
					}
					else {
						if (beginEndPgmName != match[1]) {
							diagnostics.push({
								code: undefined,
								message: 'Programmnamen stimmen nicht überein!',
								range: line.range,
								severity: vscode.DiagnosticSeverity.Error,
								source: undefined,
								relatedInformation: undefined
							});
						}
					}
				}
			}

			collection.set(document.uri, diagnostics);
		} else {
			collection.clear();
		}
}

// This method is called when your extension is deactivated
export function deactivate() { }
