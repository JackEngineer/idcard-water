import { Editor } from './features/editor/Editor';
import { nativeClient } from './features/editor/native';
export default function App() { return <Editor native={nativeClient}/>; }
