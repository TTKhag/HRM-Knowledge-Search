import { HashRouter, Route, Routes, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import ImportPage from './pages/ImportPage';
import LibraryPage from './pages/LibraryPage';
import ViewerPage from './pages/ViewerPage';
import BackupPage from './pages/BackupPage';

// HashRouter: URL dạng /#/tim-kiem — refresh trên GitHub Pages không bị 404.
export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tim-kiem" element={<SearchPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/thu-vien" element={<LibraryPage />} />
          <Route path="/tai-lieu/:id" element={<ViewerPage />} />
          <Route path="/sao-luu" element={<BackupPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
