import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { AuthProvider } from './presentation/context/AuthContext';
import { WebSocketStatusProvider } from './presentation/context/WebSocketStatusContext';

function App() {
  return (
    <AuthProvider>
      <WebSocketStatusProvider>
        <RouterProvider router={router} />
      </WebSocketStatusProvider>
    </AuthProvider>
  );
}

export default App;
