// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

let diagnosticCollection: vscode.DiagnosticCollection;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.commands.registerCommand('cnc-heidenhain-mbl.number', async () => {
		var editor = vscode.window.activeTextEditor;
		if (!editor) {
			return; // No open text editor
		}

		var document = editor.document;

		const cyclePattern = /~$/;
		const lineNumberPattern = /^\s*[0-9]*\s*/;

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
			token: vscode.CancellationToken): Thenable<vscode.DocumentSymbol[]> {
			return new Promise((resolve, reject) => {
				var symbols: vscode.DocumentSymbol[] = [];
				var outlineSymbols: vscode.DocumentSymbol[] = [];
				var toolCallSymbols: vscode.DocumentSymbol[] = [];

				const outlinePattern = /^\s*[0-9]*\s*\*(.+)/i;
				const toolCallPattern = /^\s*[0-9]*\s*TOOL\s+CALL\s+(".+"|[0-9]+|)/i;

				for (var i = 0; i < document.lineCount; i++) {
					var line = document.lineAt(i);

					var match = outlinePattern.exec(line.text);
					if (match) {
						var last = outlineSymbols.at(-1);
						if (last) {
							last.range = new vscode.Range(last.range.start, line.range.start);
						}

						var text = match[1];
						var symbol = new vscode.DocumentSymbol(text, '', vscode.SymbolKind.Module, line.range, line.range);
						symbols.push(symbol);
						outlineSymbols.push(symbol);
					}

			

					var match = toolCallPattern.exec(line.text);
					if (match) {
						var last = toolCallSymbols.at(-1);
						if (last) {
							last.range = new vscode.Range(last.range.start, line.range.start);
						}

						var text = match[1];
						if(text != "")
						{
							var symbol = new vscode.DocumentSymbol('T ' + text, '', vscode.SymbolKind.Property, line.range, line.range);
							toolCallSymbols.push(symbol);
	
							var last = outlineSymbols.at(-1);
							if (last) {
								last.children.push(symbol);
							}
						}
					}
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
