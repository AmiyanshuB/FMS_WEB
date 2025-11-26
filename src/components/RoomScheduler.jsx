// src/components/RoomScheduler.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { format, addMinutes, parseISO } from 'date-fns';
import { connectSocket } from '../lib/socket';

// Helpers
const pad = (n) => n.toString().padStart(2, '0');

const minutesToHHMM = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
};

const hhmmToMinutes = (str) => {
  if (!str) return 0;
  const [h, m] = String(str).split(':').map((v) => parseInt(v, 10) || 0);
  return h * 60 + m;
};

const formatDateKey = (date) => format(date, 'yyyy-MM-dd');

const getDayName = (date) => format(date, 'EEEE');

// Time range for the grid (8 AM to 6 PM, every 30 minutes)
const GRID_START_MINUTES = 8 * 60;
const GRID_END_MINUTES = 18 * 60;
const SLOT_STEP = 30;

const buildTimeSlots = () => {
  const slots = [];
  for (let t = GRID_START_MINUTES; t < GRID_END_MINUTES; t += SLOT_STEP) {
    slots.push(minutesToHHMM(t));
  }
  return slots;
};

const TIME_SLOTS = buildTimeSlots();

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : '';

export default function RoomScheduler() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [schedule, setSchedule] = useState([]); // weekly fixed
  const [events, setEvents] = useState([]);     // all events, filter client-side
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [editing, setEditing] = useState(null);
  // editing = { room, startTime, endTime, title, type: 'fixed' | 'event', eventId? }

  //--- detect admin via token in localStorage ---
  useEffect(() => {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('token') : null;
    setIsAdmin(!!token);
    const handler = () => {
      const t = window.localStorage.getItem('token');
      setIsAdmin(!!t);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handler);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handler);
      }
    };
  }, []);

  //--- Socket.io live sync ---
  useEffect(() => {
    const socket = connectSocket(API_BASE);

    const onScheduleUpdate = (incoming) => {
      if (Array.isArray(incoming)) setSchedule(incoming);
    };
    const onEventsUpdate = (incoming) => {
      if (Array.isArray(incoming)) setEvents(incoming);
    };

    socket.on('schedule:update', onScheduleUpdate);
    socket.on('events:update', onEventsUpdate);

    // Ask server to send latest (useful if we connected late)
    socket.emit('request:schedule');
    socket.emit('request:events');

    return () => {
      socket.off('schedule:update', onScheduleUpdate);
      socket.off('events:update', onEventsUpdate);
    };
  }, []);

  //--- Initial fetch via REST (helps even if sockets misbehave) ---
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        setLoading(true);
        setError('');
        const base = API_BASE || '';
        const [schRes, evRes] = await Promise.all([
          fetch(`${base}/api/schedule`),
          fetch(`${base}/api/events`)
        ]);
        if (!schRes.ok) throw new Error('Failed to load weekly schedule');
        if (!evRes.ok) throw new Error('Failed to load events');
        const schJson = await schRes.json();
        const evJson = await evRes.json();
        setSchedule(Array.isArray(schJson) ? schJson : []);
        setEvents(Array.isArray(evJson) ? evJson : []);
      } catch (e) {
        console.error(e);
        setError(e.message || 'Failed to load timetable');
      } finally {
        setLoading(false);
      }
    };
    fetchInitial();
  }, []);

  const dayName = getDayName(selectedDate);
  const dateKey = formatDateKey(selectedDate);

  // Filter events for selected date
  const eventsForDay = useMemo(
    () => events.filter((ev) => ev.date === dateKey),
    [events, dateKey]
  );

  // Build list of rooms from both schedule + events
  const rooms = useMemo(() => {
    const sRooms = schedule.map((s) => s.room).filter(Boolean);
    const eRooms = eventsForDay.map((e) => e.room).filter(Boolean);
    return Array.from(new Set([...sRooms, ...eRooms])).sort();
  }, [schedule, eventsForDay]);

  // Build grid: rooms x timeslots
  const grid = useMemo(() => {
    const result = {};
    for (const room of rooms) {
      result[room] = {};
    }

    // weekly fixed classes -> red
    for (const item of schedule) {
      if (!item || item.day !== dayName) continue;
      const room = item.room;
      if (!result[room]) result[room] = {};
      const sMin = hhmmToMinutes(item.startTime);
      const eMin = hhmmToMinutes(item.endTime);
      for (let t = sMin; t < eMin; t += SLOT_STEP) {
        const key = minutesToHHMM(t);
        if (!TIME_SLOTS.includes(key)) continue;
        result[room][key] = {
          label: item.className || item.class || 'Class',
          type: 'fixed',
          startTime: item.startTime,
          endTime: item.endTime,
          source: item
        };
      }
    }

    // date-specific events -> blue
    for (const ev of eventsForDay) {
      const room = ev.room;
      if (!result[room]) result[room] = {};
      const sMin = hhmmToMinutes(ev.startTime);
      const eMin = hhmmToMinutes(ev.endTime);
      for (let t = sMin; t < eMin; t += SLOT_STEP) {
        const key = minutesToHHMM(t);
        if (!TIME_SLOTS.includes(key)) continue;
        result[room][key] = {
          label: ev.eventName || 'Event',
          type: 'event',
          startTime: ev.startTime,
          endTime: ev.endTime,
          eventId: ev.id,
          source: ev
        };
      }
    }

    return result;
  }, [rooms, schedule, eventsForDay, dayName]);

  // --- Editing helpers ---

  const openEditor = (room, slot) => {
    if (!isAdmin) return;
    const row = grid[room] || {};
    const cell = row[slot];

    if (cell) {
      // Editing an existing block
      setEditing({
        room,
        startTime: cell.startTime || slot,
        endTime: cell.endTime || minutesToHHMM(hhmmToMinutes(slot) + SLOT_STEP),
        title: cell.label || '',
        type: cell.type, // 'fixed' | 'event'
        eventId: cell.eventId || null
      });
    } else {
      // Creating a new one in this slot
      const startTime = slot;
      const endTime = minutesToHHMM(hhmmToMinutes(slot) + SLOT_STEP);
      setEditing({
        room,
        startTime,
        endTime,
        title: '',
        type: 'fixed',
        eventId: null
      });
    }
  };

  const closeEditor = () => setEditing(null);

  // Update editing fields
  const updateEditingField = (field, value) => {
    setEditing((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  // --- API helpers for mutations ---

  const getAuthHeaders = () => {
    const token =
      (typeof window !== 'undefined' && window.localStorage.getItem('token')) || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const saveWeeklySlot = async (day, room, startTime, endTime, className) => {
    const base = API_BASE || '';
    const res = await fetch(`${base}/api/schedule/slot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({ day, room, startTime, endTime, className })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || j.message || 'Failed to update schedule');
    }
    const j = await res.json().catch(() => ({}));
    if (Array.isArray(j.schedule)) {
      setSchedule(j.schedule);
    }
  };

  const saveEvent = async (payload) => {
    const base = API_BASE || '';
    const res = await fetch(`${base}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || j.message || 'Failed to update events');
    }
    const j = await res.json().catch(() => ({}));
    if (Array.isArray(j.events)) {
      setEvents(j.events);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      setError('');
      const { room, startTime, endTime, title, type, eventId } = editing;
      const trimmedTitle = (title || '').trim();
      if (!trimmedTitle) {
        throw new Error('Please enter a title');
      }

      if (type === 'fixed') {
        await saveWeeklySlot(dayName, room, startTime, endTime, trimmedTitle);
      } else {
        if (eventId) {
          await saveEvent({
            action: 'update',
            id: eventId,
            date: dateKey,
            room,
            startTime,
            endTime,
            eventName: trimmedTitle
          });
        } else {
          await saveEvent({
            action: 'create',
            date: dateKey,
            room,
            startTime,
            endTime,
            eventName: trimmedTitle
          });
        }
      }
      setEditing(null);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    try {
      setError('');
      const { room, startTime, endTime, type, eventId } = editing;

      if (type === 'fixed') {
        // Delete fixed class by sending empty className; backend treats as delete for overlapping block
        await saveWeeklySlot(dayName, room, startTime, endTime, '');
      } else if (eventId) {
        await saveEvent({ action: 'delete', id: eventId });
      }
      setEditing(null);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Delete failed');
    }
  };

  // --- Render ---

  const onDateChange = (e) => {
    const value = e.target.value;
    if (!value) return;
    // parse using parseISO to keep it simple
    const d = parseISO(value);
    if (!isNaN(d.getTime())) {
      setSelectedDate(d);
    }
  };

  return (
    <div className="scheduler-root">
      <div className="toolbar" aria-label="Timetable controls">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="label">Select Date:</div>
          <input
            type="date"
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={onDateChange}
            className="input"
          />
          <div style={{ marginLeft: 8, color: '#374151', fontWeight: 500 }}>
            {dayName}
          </div>
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
          {isAdmin && (
            <div style={{ fontSize: 12, color: '#059669', marginLeft: 12 }}>
              Admin mode: click any slot to edit
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>Loading timetable…</div>
      )}
      {error && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'crimson' }}>{error}</div>
      )}

      <div className="card timeline" aria-label="Room timetable grid">
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Schedule for {format(selectedDate, 'MMMM d, yyyy')}
        </h2>

        <div className="grid-header">
          <div className="room-col">Room / Time</div>
          <div className="times-row">
            {TIME_SLOTS.map((slot) => (
              <div key={slot} className="time-cell">
                {slot}
              </div>
            ))}
          </div>
        </div>

        {/* rows */}
        {rooms.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: '#6b7280' }}>
            No rooms for this day yet. {isAdmin ? 'Click a slot to start adding classes or events.' : ''}
          </div>
        )}

        {rooms.map((room) => (
          <div key={room} className="row">
            <div className="room-col">{room}</div>
            <div className="times-row">
              {TIME_SLOTS.map((slot) => {
                const cell = (grid[room] && grid[room][slot]) || null;
                const isEditing =
                  editing && editing.room === room && editing.startTime === slot;

                let className = 'slot';
                if (cell) {
                  className += cell.type === 'fixed' ? ' fixed' : ' event';
                }

                return (
                  <div
                    key={slot}
                    className={className}
                    onClick={() => openEditor(room, slot)}
                  >
                    {/* Display block title */}
                    {cell && !isEditing && <span>{cell.label}</span>}

                    {/* Inline editor */}
                    {isEditing && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                        <input
                          className="input"
                          style={{ fontSize: 11, padding: 4 }}
                          value={editing.title}
                          onChange={(e) => updateEditingField('title', e.target.value)}
                          placeholder="Class / event name"
                        />
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="radio"
                              checked={editing.type === 'fixed'}
                              onChange={() => updateEditingField('type', 'fixed')}
                            />
                            Weekly (red)
                          </label>
                          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="radio"
                              checked={editing.type === 'event'}
                              onChange={() => updateEditingField('type', 'event')}
                            />
                            Date-specific (blue)
                          </label>
                        </div>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {cell && (
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 11 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete();
                              }}
                            >
                              Delete
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn"
                            style={{ fontSize: 11 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              closeEditor();
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn"
                            style={{ fontSize: 11 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSave();
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}