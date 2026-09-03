import { Outlet } from 'react-router';
import { StringsProvider } from './context/StringsContext';
import { UpdatePrompt } from './components/UpdatePrompt/UpdatePrompt';

export function App() {
  return (
    <StringsProvider>
      <UpdatePrompt />
      <Outlet />
    </StringsProvider>
  );
}
