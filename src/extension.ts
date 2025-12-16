// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { PropertyDefenition } from './toolCallModel';

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

				var activeSymbol: vscode.DocumentSymbol | undefined;

				const outlinePattern = /^\s*[0-9]*\s*\*(.+)/i;
				const toolCallPattern = /^\s*[0-9]*\s*TOOL\s+CALL\s+(".+"|[0-9]+|)\s+([XYZ]|)\s*(S[0-9]+|)\s*(F[0-9]+|)\s*(DL[+-][0-9.]+|)\s*(DR[+-][0-9.]+|)/i;

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
						activeSymbol = symbol;
						outlineSymbols.push(symbol);
					}
				}

				resolve(symbols);
			});
		}
	}));

	context.subscriptions.push(vscode.languages.registerDefinitionProvider('heidenhain', {
		provideDefinition(document: vscode.TextDocument,
			position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Location> {
			return new Promise((resolve, reject) => {
				const range = document.getWordRangeAtPosition(position);
				const word = document.getText(range);
				const line = document.lineAt(position.line).text;

				const lblCallPattern = /^\s*[0-9]*\s*CALL\s+LBL\s+(".+"|[0-9]+|)/i;

				var match = lblCallPattern.exec(line);
				if (match) {
					const pattern = new RegExp('^\\s*[0-9]*\\s*LBL\\s+' + match[1], 'i');
					for (var i = 0; i < document.lineCount; i++) {
						var searchLine = document.lineAt(i);
						if (searchLine.text.match(pattern)) {
							resolve(new vscode.Location(document.uri, searchLine.range));
						}
					}
				}
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
	if (document) {
		if (document.languageId === 'heidenhain') {
			collection.clear();
			var diagnostics: vscode.Diagnostic[] = [];
			var lbls: string[] = [];
			var lblDefinitions = new Map<string, vscode.Range>();

			const lblPattern = /^\s*[0-9]*\s*LBL\s+(".+"|[0-9]+|)/i;
			const lblCallPattern = /^\s*[0-9]*\s*CALL\s+LBL\s+(".+"|[0-9]+|)/i;

			const toolCallPattern = /^\s*[0-9]*\s*TOOL\s+CALL\s+(".+"|[0-9]+|)/i;
			const toolDefPattern = /^\s*[0-9]*\s*TOOL\s+DEF\s+(".+"|[0-9]+|)/i;

			const escapeChar = /^\s*\//i;

			var tNo: PropertyDefenition | undefined;
			var definedtNo: PropertyDefenition | undefined;

			for (var i = 0; i < document.lineCount; i++) {
				var data = document.lineAt(i).text.split(';');
				var line = document.lineAt(i);
				var text = line.text.toUpperCase();
				var pgmLine = data[0].toUpperCase();

				if (pgmLine.match(escapeChar)) {
					continue;
				}

				var match = toolCallPattern.exec(pgmLine);
				if (match) {
					var range = new vscode.Range(i, match.index, i, match.index + match[0].length);
					tNo = { number: match[1], range: range };

					if (definedtNo && tNo) {
						if (definedtNo.number !== tNo.number) {
							diagnostics.push({
								code: undefined,
								message: 'Falsches Werkzeug vordefiniert!',
								range: definedtNo.range,
								severity: vscode.DiagnosticSeverity.Warning,
								source: 'Aufgerufenes Werkzeug ist ' + tNo.number + '.',
								relatedInformation: undefined
							});
						}

						definedtNo = undefined;
					}
				}

				var match = toolDefPattern.exec(pgmLine);
				if (match) {
					if (match[1] !== '') {
						var range = new vscode.Range(i, match.index, i, match.index + match[0].length);
						definedtNo = { number: match[1], range: range };
					}
				}

				var match = lblPattern.exec(text);
				if (match) {
					if (lbls.includes(match[1])) {
						diagnostics.push({
							code: undefined,
							message: 'Unterprogramm ist schon deklariert!',
							range: line.range,
							severity: vscode.DiagnosticSeverity.Error,
							source: undefined,
							relatedInformation: undefined
						});
					}

					else {
						if (match[1] !== "0") {
							lbls.push(match[1]);
							lblDefinitions.set(match[1], line.range);
						}
					}
				}
			}

			for (var i = 0; i < document.lineCount; i++) {
				var line = document.lineAt(i);
				var text = line.text.toUpperCase();

				var match = lblCallPattern.exec(text);
				if (match) {
					lblDefinitions.delete(match[1]);
					if (!lbls.includes(match[1])) {
						diagnostics.push({
							code: undefined,
							message: 'Unterprogramm ist nicht vorhanden!',
							range: line.range,
							severity: vscode.DiagnosticSeverity.Warning,
							source: undefined,
							relatedInformation: undefined
						});
					}
				}
			}

			lblDefinitions.forEach(element => {
				diagnostics.push({
					code: undefined,
					message: 'Unterprogramm wird nie verwendet!',
					range: element,
					severity: vscode.DiagnosticSeverity.Information,
					source: undefined,
					relatedInformation: undefined
				});
			});

			collection.set(document.uri, diagnostics);
		} else {
			collection.clear();
		}
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }
