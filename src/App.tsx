import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import WartungsartenPage from '@/pages/WartungsartenPage';
import WartungsartenDetailPage from '@/pages/WartungsartenDetailPage';
import WartungsprotokollePage from '@/pages/WartungsprotokollePage';
import WartungsprotokolleDetailPage from '@/pages/WartungsprotokolleDetailPage';
import PublicFormWartungsarten from '@/pages/public/PublicForm_Wartungsarten';
import PublicFormWartungsprotokolle from '@/pages/public/PublicForm_Wartungsprotokolle';
// <public:imports>
// </public:imports>
// <custom:imports>
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/6a47826ee31558df03851d7e" element={<PublicFormWartungsarten />} />
              <Route path="public/6a478275fd40d1bdf4314de4" element={<PublicFormWartungsprotokolle />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="wartungsarten" element={<WartungsartenPage />} />
                <Route path="wartungsarten/:id" element={<WartungsartenDetailPage />} />
                <Route path="wartungsprotokolle" element={<WartungsprotokollePage />} />
                <Route path="wartungsprotokolle/:id" element={<WartungsprotokolleDetailPage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
