import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './api/client';
import Editor from './pages/Editor';
import Login from './pages/Login';
import Register from './pages/Register';
import ResumeList from './pages/ResumeList';

function Guard({ children }: { children: ReactElement }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<Guard><ResumeList /></Guard>} />
      <Route path="/resume/:id" element={<Guard><Editor /></Guard>} />
    </Routes>
  );
}
