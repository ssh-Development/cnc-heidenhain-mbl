//@ts-check

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState() || { colors: [] };

    /** @type {Array<{ value: string }>} */
    let colors = oldState.colors;

    updateColorList(colors);


    /**
     * @param {Array<{ value: string }>} colors
     */
    function updateColorList(colors) {

        fetch('./data.json')
        .then((response) => response.json())
        .then((json) => console.log(json));

    }

    /** 
     * @param {string} text
     */
    function onColorClicked(text) {
        vscode.postMessage({ type: 'insertTextBlock', value: text });
    }

}());


