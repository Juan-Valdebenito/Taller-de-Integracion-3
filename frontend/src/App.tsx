import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { AuthProvider } from './presentation/context/AuthContext';
import { WebSocketStatusProvider } from './presentation/context/WebSocketStatusContext';
import { WebSocketStatusBanner } from './presentation/components/feedback/WebSocketStatusBanner';

function App() {
  return (
    <AuthProvider>
      <WebSocketStatusProvider>
        <WebSocketStatusBanner />
        <RouterProvider router={router} />
      </WebSocketStatusProvider>
    </AuthProvider>
  );
}

export default App;
