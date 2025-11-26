// src/components/RoomScheduler.jsx
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { connectSocket } from '../lib/socket';

// at top of file (below imports)
const API_BASE = import.meta.env.VITE_API_URL || '';
console.log('[RoomScheduler] API_BASE =', API_BASE);
const masterSchedule = [
  { day: 'Monday', room: 'Room 101', startTime: '09:00', endTime: '10:30', className: 'Mathematics 101' },
  { day: 'Monday', room: 'Room 201', startTime: '09:30', endTime: '11:00', className: 'Chemistry Lecture' },
  { day: 'Tuesday', room: 'Seminar Hall', startTime: '13:00', endTime: '15:00', className: 'Annual Seminar' }
];

export default function RoomScheduler() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [bookingDetails, setBookingDetails] = useState(null);
  const [eventName, setEventName] = useState('');

  // Time slots
  const timeSlots = [];
  for (let hour = 9; hour <= 20; hour++) {
    timeSlots.push(`${String(hour).padStart(2, '0')}:00`);
    timeSlots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  timeSlots.push('21:00');

  const rooms = [...new Set(masterSchedule.map(s => s.room))].sort();

  useEffect(() => {
    const socket = connectSocket();
    socket.on('events:update', (ev) => setEvents(ev));

    fetch(`${API_BASE}/api/events`)
      .then(r => r.json())
      .then(j => setEvents(j))
      .catch(() => {});

    return () => socket.off('events:update');
  }, []);

  const getDayName = (date) => {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return days[date.getDay()];
  };

  const getScheduleForDate = () => {
    const dayName = getDayName(selectedDate);
    const dateString = format(selectedDate, 'yyyy-MM-dd');

    const fixedClasses = masterSchedule.filter(item => item.day === dayName);
    const dateEvents = events.filter(ev => ev.date === dateString);

    return { fixedClasses, dateEvents };
  };

  const timeToMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const isSlotOccupied = (room, startTime, endTime) => {
    const { fixedClasses, dateEvents } = getScheduleForDate();
    const s = timeToMinutes(startTime), e = timeToMinutes(endTime);

    for (const cls of fixedClasses) {
      if (cls.room === room) {
        const cs = timeToMinutes(cls.startTime), ce = timeToMinutes(cls.endTime);
        if (s < ce && e > cs) return { occupied: true, type: 'fixed', data: cls };
      }
    }

    for (const ev of dateEvents) {
      if (ev.room === room) {
        const es = timeToMinutes(ev.startTime), ee = timeToMinutes(ev.endTime);
        if (s < ee && e > es) return { occupied: true, type: 'event', data: ev };
      }
    }

    return { occupied: false };
  };

  const handleSlotClick = (room, startTime, endTime) => {
    const status = isSlotOccupied(room, startTime, endTime);

    if (status.occupied && status.type === 'event') {
      if (window.confirm(`Delete event: ${status.data.eventName}?`)) {
        const token = localStorage.getItem('token');
        if (!token) return alert('Admin only. Please login.');

        fetch(`${API_BASE}/api/events/${status.data.id}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token }
        })
          .then(r => {
            if (!r.ok) throw r;
            return r.json();
          })
          .then(() => alert('Event deleted'))
          .catch(async (err) => {
            const j = await (err.json?.() ?? Promise.resolve({ message: 'Delete failed' }));
            alert(j.message || 'Delete failed');
          });
      }
      return;
    }

    if (!status.occupied) {
      setBookingDetails({ room, startTime, endTime });
      setEventName('');
      setIsModalOpen(true);
    }
  };

  const handleSave = () => {
    if (!eventName.trim()) return alert('Enter event name');

    const token = localStorage.getItem('token');
    if (!token) return alert('Admin only. Please login.');

    const newEvent = {
      date: format(selectedDate, 'yyyy-MM-dd'),
      room: bookingDetails.room,
      startTime: bookingDetails.startTime,
      endTime: bookingDetails.endTime,
      eventName: eventName.trim()
    };

    fetch(`${API_BASE}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(newEvent)
    })
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({ message: 'Error creating event' }));
          throw new Error(j.message);
        }
        return r.json();
      })
      .then(() => {
        setIsModalOpen(false);
        alert('Event booked');
      })
      .catch(err => alert(err.message || 'Booking failed'));
  };

  const { fixedClasses } = getScheduleForDate();

  return (
    <div>
      <div className="header">
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>College Room Scheduler</h1>
        <p style={{ color: '#6b7280' }}>Manage room bookings and view class schedules</p>
      </div>

      <div className="card controls" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="label">Select Date:</div>
          <input
            type="date"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={(e) => setSelectedDate(new Date(e.target.value))}
            className="input"
          />
          <div style={{ marginLeft: 8, color: '#374151' }}>{getDayName(selectedDate)}</div>
        </div>

        <div style={{ marginLeft: 'auto' }} className="legend">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="sw" style={{ background: '#ef4444' }}></div>
            <div style={{ fontSize: 13 }}>Fixed Classes</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="sw" style={{ background: '#3b82f6' }}></div>
            <div style={{ fontSize: 13 }}>Events</div>
          </div>
        </div>
      </div>

      <div className="card timeline">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Schedule for {format(selectedDate, 'MMMM d, yyyy')}
        </h2>

        <div className="grid-header" style={{ borderBottom: '1px solid #e5e7eb' }}>
          <div className="room-col">Room / Time</div>
          <div className="times-row" style={{ flex: 1 }}>
            {timeSlots.slice(0, -1).map((t, idx) => (
              <div key={idx} className="time-cell">
                {t}
              </div>
            ))}
          </div>
        </div>

        {rooms.map((room, ri) => (
          <div key={ri} className="row">
            <div className="room-col">{room}</div>
            <div style={{ flex: 1, display: 'flex' }}>
              {timeSlots.slice(0, -1).map((t, ti) => {
                const st = t;
                const en = timeSlots[ti + 1];
                const status = isSlotOccupied(room, st, en);
                const cls = status.occupied
                  ? status.type === 'fixed'
                    ? 'slot fixed'
                    : 'slot event'
                  : 'slot';

                return (
                  <div
                    key={ti}
                    className={cls}
                    onClick={() => handleSlotClick(room, st, en)}
                    title={
                      status.occupied
                        ? status.type === 'fixed'
                          ? `${status.data.className} (${status.data.startTime}-${status.data.endTime})`
                          : `${status.data.eventName} (${status.data.startTime}-${status.data.endTime}) - Click to delete`
                        : `Book ${room} at ${st}`
                    }
                  >
                    {status.occupied
                      ? status.type === 'fixed'
                        ? status.data.className
                        : status.data.eventName
                      : ''}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && bookingDetails && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3 style={{ margin: 0 }}>Book Event</h3>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Room</div>
              <div style={{ fontWeight: 600 }}>{bookingDetails.room}</div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Date</div>
              <div style={{ fontWeight: 600 }}>{format(selectedDate, 'PPP')}</div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Time</div>
              <div style={{ fontWeight: 600 }}>
                {bookingDetails.startTime} - {bookingDetails.endTime}
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Event Name</div>
              <input
                className="input"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Enter event name"
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button className="btn" onClick={handleSave}>
                Book Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
