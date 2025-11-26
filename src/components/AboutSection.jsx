// src/components/AboutSection.jsx
import React from 'react';

export default function AboutSection() {
  return (
    <section className="about-section" aria-labelledby="about-heading">
      <div className="about-inner">
        <h2 id="about-heading" className="about-title">
          About the System
        </h2>
        <span className="about-underline" />

        <p className="about-text">
          This system is designed to manage and display the weekly timetable for the institute.
          It allows students and faculty to quickly see which classes are running in which rooms
          at any given time.
        </p>

        <p className="about-text">
          Administrators can update fixed weekly classes and special one-day events in real time.
          Any changes made by admins are instantly visible to everyone, ensuring that the timetable
          always stays accurate and up to date.
        </p>
      </div>
    </section>
  );
}
