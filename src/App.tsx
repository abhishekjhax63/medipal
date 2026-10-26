import { AnimatePresence, motion } from "framer-motion";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { LoginModal } from "@/components/auth/LoginModal";
import { AmbientBackdrop } from "@/components/layout/AmbientBackdrop";
import { Footer } from "@/components/layout/Footer";
import { GlassNavbar } from "@/components/layout/GlassNavbar";
import { EuFooter } from "@/components/eupchar/EuFooter";
import { EupcharBookingProvider } from "@/context/EupcharBookingContext";
import { UIProvider, useUI } from "@/context/UIContext";
import { useScrollBehaviour } from "@/hooks/useScrollBehaviour";
import AboutPage from "@/pages/AboutPage";
import AIDoctorPage from "@/pages/AIDoctorPage";
import BloodBankPage from "@/pages/BloodBankPage";
import AdminConsolePage from "@/pages/blood-bank/AdminConsolePage";
import FacilityConsolePage from "@/pages/blood-bank/FacilityConsolePage";
import ContactPage from "@/pages/ContactPage";
import ReviewsPage from "@/pages/ReviewsPage";
import EUpcharHomePage from "@/pages/eupchar/EUpcharHomePage";
import LocationSelectPage from "@/pages/eupchar/LocationSelectPage";
import HospitalDirectoryPage from "@/pages/eupchar/HospitalDirectoryPage";
import HospitalProfilePage from "@/pages/eupchar/HospitalProfilePage";
import ServiceDetailPage from "@/pages/eupchar/ServiceDetailPage";
import UploadPrescriptionPage from "@/pages/eupchar/UploadPrescriptionPage";
import PatientsPage from "@/pages/eupchar/PatientsPage";
import AppointmentsPage from "@/pages/eupchar/AppointmentsPage";
import ReportsPage from "@/pages/eupchar/ReportsPage";
import CheckoutPage from "@/pages/eupchar/CheckoutPage";
import ConfirmationPage from "@/pages/eupchar/ConfirmationPage";
import ReceiptPage from "@/pages/eupchar/ReceiptPage";
import DirectionsPage from "@/pages/eupchar/DirectionsPage";
import AdminPage from "@/pages/eupchar/AdminPage";
import AmbulancePage from "@/pages/ambulance/AmbulancePage";
import AmbulanceBookPage from "@/pages/ambulance/AmbulanceBookPage";
import AmbulanceTrackPage from "@/pages/ambulance/AmbulanceTrackPage";

export default function App() {
  return (
    <BrowserRouter>
      <UIProvider>
        <AppShell />
      </UIProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const location = useLocation();
  const { loginOpen, closeLogin } = useUI();
  const isAiDoctor = location.pathname.startsWith("/ai-doctor");
  const isEUpchar = location.pathname.startsWith("/e-upchar");
  const isAmbulance = location.pathname.startsWith("/ambulance");

  useScrollBehaviour(location.pathname, location.hash);

  return (
    <EupcharBookingProvider>
      <div className="relative flex min-h-screen flex-col">
        <AmbientBackdrop variant={isEUpchar ? "eupchar" : isAiDoctor ? "ai" : isAmbulance ? "ambulance" : "blood"} />
        <GlassNavbar />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            className="flex flex-1 flex-col"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <Routes location={location}>
              {/* Blood Bank remains the default experience. */}
              <Route path="/" element={<BloodBankPage />} />
              <Route path="/ai-doctor" element={<AIDoctorPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/reviews" element={<ReviewsPage />} />
              <Route path="/contact" element={<ContactPage />} />

              {/* Blood Bank operator consoles — facility stock management and platform administration. */}
              <Route path="/blood-bank/facility" element={<FacilityConsolePage />} />
              <Route path="/blood-bank/admin" element={<AdminConsolePage />} />

              {/* E-UPCHAR — hospital discovery, diagnostics booking and patient management. */}
              <Route path="/e-upchar" element={<EUpcharHomePage />} />
              <Route path="/e-upchar/location" element={<LocationSelectPage />} />
              <Route path="/e-upchar/hospitals" element={<HospitalDirectoryPage />} />
              <Route path="/e-upchar/hospitals/:hospitalId" element={<HospitalProfilePage />} />
              <Route path="/e-upchar/services/:serviceId" element={<ServiceDetailPage />} />
              <Route path="/e-upchar/prescription" element={<UploadPrescriptionPage />} />
              <Route path="/e-upchar/patients" element={<PatientsPage />} />
              <Route path="/e-upchar/appointments" element={<AppointmentsPage />} />
              <Route path="/e-upchar/reports" element={<ReportsPage />} />
              <Route path="/e-upchar/checkout" element={<CheckoutPage />} />
              <Route path="/e-upchar/confirmation/:bookingId" element={<ConfirmationPage />} />
              <Route path="/e-upchar/receipt/:bookingId" element={<ReceiptPage />} />
              <Route path="/e-upchar/directions/:hospitalId" element={<DirectionsPage />} />
              <Route path="/e-upchar/admin" element={<AdminPage />} />

              {/* Ambulance — emergency transport and provider network. */}
              <Route path="/ambulance" element={<AmbulancePage />} />
              <Route path="/ambulance/book" element={<AmbulanceBookPage />} />
              <Route path="/ambulance/track" element={<AmbulanceTrackPage />} />
              <Route path="/ambulance/track/:bookingId" element={<AmbulanceTrackPage />} />

              <Route path="*" element={<BloodBankPage />} />
            </Routes>
          </motion.div>
        </AnimatePresence>

        {isEUpchar ? <EuFooter /> : !isAiDoctor && !isAmbulance ? <Footer /> : null}

        <LoginModal open={loginOpen} onClose={closeLogin} />
      </div>
    </EupcharBookingProvider>
  );
}
