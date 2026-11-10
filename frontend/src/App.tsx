import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, RequireAuth, useAuth } from "./auth";
import { Footer, Header } from "./components/Layout";
import { I18nProvider } from "./i18n";
import { Login, Signup } from "./pages/Auth";
import Drive from "./pages/Drive";
import Events from "./pages/Events";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import OfferRide from "./pages/OfferRide";
import RideDetail from "./pages/RideDetail";
import Search from "./pages/Search";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/** The v3 landing brings its own nav and footer; every other page gets the app's. */
function Chrome({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { user, ready } = useAuth();
  const landing = pathname === "/" && (!ready || !user);
  return <>{!landing && <Header />}{children}{!landing && <Footer />}</>;
}

/** "/" is the landing page for visitors; logged-in users go to their home. */
function Root() {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Navigate to="/home" replace /> : <Landing />;
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Chrome>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/events" element={<Events />} />
            <Route path="/search" element={<Search />} />
            <Route path="/rides/:id" element={<RideDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/drive" element={<RequireAuth><Drive /></RequireAuth>} />
            <Route path="/drive/new" element={<RequireAuth><OfferRide /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Chrome>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
