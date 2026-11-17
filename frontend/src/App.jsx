import {Routes, Route, Navigate} from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';

import Navbar from "./components/Navbar"
import HomePage from './pages/HomePage'
import SignUpPage from './pages/SignUpPage'
import LoginPage from './pages/LoginPage'
import SettingPage from './pages/SettingPage'
import ProfilePage from './pages/ProfilePage'
import OtpVerypage from './pages/OtpVerifyPage'
import { useAuthStore } from './store/useAuthStore'
import { useThemeStore } from './store/useThemeStore';
import { useCallStore } from './store/useCallStore';
import MobileNav from './components/MobileNav';
import IncomingCallModal from './components/IncomingCallModal';
import VideoCall from './components/VideoCall';

const App = () => {

  const {authUser, checkAuth, isCheckingAuth, socket} = useAuthStore();
  const {theme} = useThemeStore();
  const {initializeSocketListeners, uninitializeSocketListeners, callActive} = useCallStore();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  },[checkAuth]);

  useEffect(() => {
    if (socket) {
      initializeSocketListeners(socket);
    }
    return () => {
      uninitializeSocketListeners();
    };
  }, [socket, initializeSocketListeners, uninitializeSocketListeners]);

  if(isCheckingAuth && !authUser){
    return(
      <div className='flex items-center justify-center h-screen'>
        <span className="loading loading-spinner loading-xl"></span>
      </div>
    )
  }

  return (
    <div data-theme = {theme}>
      <Navbar menuOpen = {menuOpen} setMenuOpen = {setMenuOpen}/>

      <MobileNav menuOpen = {menuOpen} setMenuOpen = {setMenuOpen}/>
      
      <Routes>
        <Route 
          path='/' 
          element={
            authUser 
              ? (authUser.isVerified ? <HomePage /> : <Navigate to={'/verify'} />) 
              : <Navigate to={'/login'} />
          } 
        />

          <Route 
            path='/signup' 
            element={
              !authUser 
                ? <SignUpPage /> 
                : (authUser.isVerified ? <Navigate to={'/'} /> : <Navigate to={'/verify'} />)
            } 
          />

          <Route 
            path='/login'
            element={
              !authUser 
                ? <LoginPage />  
                : (authUser.isVerified ? <Navigate to={'/'} /> : <Navigate to={'/verify'} />)
            } 
          />

          <Route 
            path='/settings' 
            element={ <SettingPage />} 
          />

          <Route 
            path='/profile' 
            element={
              authUser 
                ? (authUser.isVerified ? <ProfilePage /> : <Navigate to={'/verify'} />) 
                : <Navigate to={'/login'} />
            } 
          />

          <Route 
            path='/verify' 
            element={
              authUser 
                ? (!authUser.isVerified ? <OtpVerypage /> : <Navigate to={'/'} />) 
                : <Navigate to={'/login'} />
            } 
          />

        </Routes>

      {callActive && <VideoCall />}

      <IncomingCallModal />
      <Toaster />
    </div>
  )
}

export default App