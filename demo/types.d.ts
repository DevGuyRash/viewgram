declare module '*.mmd' { const text: string; export default text; }

interface Window {
  demo: {
    scopes: import('../src/viewer/render-scope').RenderScope[];
    sources: Record<string, string>;
    sessions: import('../src/viewer/source-editor-sessions').SourceEditorSessions;
    mount(name: string, target: HTMLElement): import('../src/viewer/render-scope').RenderScope;
    DiagramViewer: typeof import('../src/viewer/diagram').DiagramViewer;
    RenderScope: typeof import('../src/viewer/render-scope').RenderScope;
    SourceEditor: typeof import('../src/viewer/source-editor').SourceEditor;
    SourceEditorSessions: typeof import('../src/viewer/source-editor-sessions').SourceEditorSessions;
    EditorView: typeof import('@codemirror/view').EditorView;
    disposeAll(): void;
    ready: boolean;
  };
}
