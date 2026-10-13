import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { lazy, Suspense, useEffect, useRef } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import Footer from "./components/Footer";
import Header from "./components/Header";
import { PageSky } from "./components/Sky";
import Landing from "./landing/Landing";
import { page } from "./motion";
import { useSession } from "./session";

// The app screens load on demand so the landing page ships less JavaScript.
const Practice = lazy(() => import("./practice/Practice"));
const Interview = lazy(() => import("./interview/Interview"));
const Report = lazy(() => import("./report/Report"));

// Each route is a time of day (docs/DESIGN.md).
const SKY = { "/practice": "dawn", "/interview": "noon", "/report": "night" };

const TITLES = {
  "/": "Rehearse · Practise interviews out loud",
  "/practice": "Set up · Rehearse",
  "/interview": "Interview · Rehearse",
  "/report": "Debrief · Rehearse",
};

export default function App() {
  const location = useLocation();
  const { setStatus } = useSession();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    document.title = TITLES[location.pathname] || "Rehearse";
    // New page starts at the top, unless it's an in-page anchor.
    if (!location.hash) window.scrollTo(0, 0);
    // Leaving the interview page mid-way (e.g. browser back) means it can't be resumed.
    if (prevPath.current === "/interview" && location.pathname !== "/interview" && location.pathname !== "/report") {
      setStatus("left");
    }
    if (location.pathname !== "/interview") window.speechSynthesis?.cancel();
    prevPath.current = location.pathname;
  }, [location.pathname, location.hash, setStatus]);

  const landing = !SKY[location.pathname];
  const tone = SKY[location.pathname] || "dawn";

  useEffect(() => {
    // The overscroll colour follows the page's sky.
    document.documentElement.style.background = landing ? "#fcd9c4" : { dawn: "#fcd9c4", noon: "#bfe3f5", night: "#1e1b4b" }[tone];
  }, [landing, tone]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="app" data-sky={tone}>
        <a href="#main" className="skip-link">Skip to content</a>
        {!landing && <PageSky tone={tone} />}
        <Header landing={landing} />
        <main id="main" className="main">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} {...page}>
              <Suspense fallback={<div className="route-loading" role="status"><span className="sr-only">Loading…</span></div>}>
                <Routes location={location}>
                  <Route path="/" element={<Landing />} />
                  <Route path="/practice" element={<Practice />} />
                  <Route path="/interview" element={<Interview />} />
                  <Route path="/report" element={<Report />} />
                  <Route path="*" element={<Landing />} />
                </Routes>
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
        {location.pathname !== "/interview" && (
          <div data-sky={landing ? "night" : tone} className={landing ? "footer-night" : undefined}>
            <Footer />
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
