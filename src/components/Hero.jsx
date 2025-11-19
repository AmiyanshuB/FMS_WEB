import React from 'react'

export default function Hero({title='FMS Schedule Tracking', subtitle='Streamlines your interview tracking and feedback management'}){
  return (
    <header className="hero" role="banner" aria-label="Hero banner">
      <div className="hero-inner">
        <h1 className="hero-title">{title}</h1>
        <p className="hero-sub">{subtitle}</p>
      </div>
    </header>
  )
}
