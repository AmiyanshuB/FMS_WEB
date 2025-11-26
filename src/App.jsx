import React from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import RoomScheduler from './components/RoomScheduler'
import AboutSection from './components/AboutSection'
import SiteFooter from './components/SiteFooter'
import './index.css'

export default function App() {
  return (
    <div className="app-root">
      <Navbar />
      <Hero title="FMS Schedule Tracking" subtitle="Track Your Daily Schedule" />

      <main className="main-content">
        <RoomScheduler />
      </main>

      <AboutSection />
      <SiteFooter />
    </div>
  )
}
