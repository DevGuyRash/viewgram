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
    SemanticHighlighter: typeof import('../src/viewer/semantics').SemanticHighlighter;
    SourceEditorSessions: typeof import('../src/viewer/source-editor-sessions').SourceEditorSessions;
    EditorView: typeof import('@codemirror/view').EditorView;
    DEFAULT_SETTINGS: typeof import('../src/viewer/settings').DEFAULT_SETTINGS;
    readSettings: typeof import('../src/viewer/settings').readSettings;
    setSettings(changes: Partial<import('../src/viewer/settings').ViewerSettings>): void;
    getSettings(): import('../src/viewer/settings').ViewerSettings;
    disposeAll(): void;
    ready: boolean;
    taxonomy?: typeof import('./taxonomy-data').taxonomy;
    runTypeCase?(id: string): Promise<import('./demo').TypeResult>;
    typeResults?: import('./demo').TypeResult[];
    showOriginal?(id: string): Promise<import('./demo').TypeResult>;
    attachTypeViewer?(result: import('./demo').TypeResult): Promise<import('./demo').TypeResult>;
  };
}
