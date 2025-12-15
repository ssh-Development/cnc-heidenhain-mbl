import * as vscode from 'vscode';

export class PropertyDefenition {
    number: string = "";
    range!: vscode.Range;

    constructor(number : string, range: vscode.Range) {
        this.number = number;
        this.range = range;
    }
}