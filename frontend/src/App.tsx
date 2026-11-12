import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, RequireAuth, useAuth } from "./auth";
import { Credit, Footer, Header } from "./components/Layout";
import { I18nProvider } from "./i18n";
import Landing from "./pages/Landing";

// Every page except the landing is its own chunk, loaded when first visited:
// the landing no longer downloads the map library and the app screens up front.
const Login = lazy(() => import("./pages/Auth").then((m) => ({ default: m.Login })));
const Signup = lazy(() => import("./pages/Auth").then((m) => ({ default: m.Signup })));
const Drive = lazy(() => import("./pages/Drive"));
const Events = lazy(() => import("./pages/Events"));
const Home = lazy(() => import("./pages/Home"));
const MyRides = lazy(() => import("./pages/MyRides"));
const OfferRide = lazy(() => import("./pages/OfferRide"));
const RideDetail = lazy(() => import("./pages/RideDetail"));
const Search = lazy(() => import("./pages/Search"));

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
  return <>{!landing && <Header />}{children}{!landing && !user && <Footer />}<Credit /></>;
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
          <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Root />} />
            <Route path="/events" element={<Events />} />
            <Route path="/search" element={<Search />} />
            <Route path="/rides/:id" element={<RideDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/home" element={<RequireAuth><Home /></RequireAuth>} />
            <Route path="/my-rides" element={<RequireAuth><MyRides /></RequireAuth>} />
            <Route path="/drive" element={<RequireAuth><Drive /></RequireAuth>} />
            <Route path="/drive/new" element={<RequireAuth><OfferRide /></RequireAuth>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </Chrome>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
