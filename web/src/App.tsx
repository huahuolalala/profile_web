import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './api/client';
import Editor from './pages/Editor';
import Login from './pages/Login';
import Register from './pages/Register';
import ResumeList from './pages/ResumeList';
import Welcome from './pages/Welcome';

function Guard({ children }: { children: ReactElement }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/mind" element={<Guard><ResumeList /></Guard>} />
      <Route path="/mind/:id" element={<Guard><Editor /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
