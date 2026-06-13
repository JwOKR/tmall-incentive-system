import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Takers from './pages/Takers';
import Tasks from './pages/Tasks';
import Orders from './pages/Orders';
import Logs from './pages/Logs';
import ExportPage from './pages/ExportPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/takers" element={<Takers />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/export" element={<ExportPage />} />
          </Routes>
        </Layout>
      </Router>
    </QueryClientProvider>
  );
}

export default App;