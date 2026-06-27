import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const getUserId = (token) => {
  try {
    return token ? JSON.parse(atob(token.split(".")[1])).id : null;
  } catch (e) {
    return null;
  }
};

/*
 * EventAttendance — shown on the public event page (/public/event/:slug).
 *
 * Any logged-in user can mark themselves as an attendee or remove themselves.
 * The event owner also gets a Remove button next to every other member.
 *
 * Props:
 *   eventid      — numeric event ID
 *   eventownerid — numeric owner ID (to determine if current user is owner)
 *   initialMembers — member array already fetched by the parent page
 */
const EventAttendance = ({ eventid, eventownerid, initialMembers = [] }) => {
  const token = localStorage.getItem("token");
  const loggedInUserId = getUserId(token);
  const apiUrl = process.env.REACT_APP_API_URL;

  const [members, setMembers] = useState(initialMembers);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Keep in sync if parent re-fetches and passes new initialMembers
  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  const isOwner = loggedInUserId && loggedInUserId === eventownerid;
  const isMember = loggedInUserId && members.some((m) => m.id === loggedInUserId);

  const handleAddSelf = async () => {
    setError("");
    setLoading(true);
    try {
      await axios.post(
        `${apiUrl}/events/${eventid}/members`,
        { userid: loggedInUserId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Optimistically add self to the list
      const payload = JSON.parse(atob(token.split(".")[1]));
      setMembers((prev) => [
        ...prev,
        { id: loggedInUserId, username: payload.username, firstname: "", lastname: "" },
      ]);
    } catch (err) {
      setError(err.response?.data?.message || "Could not mark attendance. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (userIdToRemove) => {
    const isSelf = userIdToRemove === loggedInUserId;
    if (!isSelf && !window.confirm("Remove this attendee?")) return;

    setError("");
    setLoading(true);
    try {
      await axios.delete(`${apiUrl}/events/${eventid}/members/${userIdToRemove}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMembers((prev) => prev.filter((m) => m.id !== userIdToRemove));
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove attendee. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="event-attendance-section">
      <h2>Attendees ({members.length})</h2>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Self-service attendance button */}
      {loggedInUserId ? (
        isMember ? (
          <button
            className="button"
            type="button"
            disabled={loading}
            onClick={() => handleRemove(loggedInUserId)}
          >
            Remove myself from attendees
          </button>
        ) : (
          <button
            className="button"
            type="button"
            disabled={loading}
            onClick={handleAddSelf}
          >
            I attended this event!
          </button>
        )
      ) : (
        <p>
          <Link to="/login">Log in</Link> to mark yourself as an attendee.
        </p>
      )}

      {/* Attendee list */}
      {members.length > 0 && (
        <div className="event-container" style={{ marginTop: "1rem" }}>
          {members.map((member) => (
            <div className="event-card" key={member.id}>
              {member.image && (
                <img src={member.image} alt={`${member.username}'s avatar`} />
              )}
              <h3>
                <Link to={`/public/${member.username}`}>
                  @{member.username}
                </Link>
              </h3>
              {(member.firstname || member.lastname) && (
                <h4>{member.firstname} {member.lastname}</h4>
              )}
              {/* Owner can remove anyone; regular users can only remove themselves (via the button above) */}
              {isOwner && member.id !== loggedInUserId && (
                <button
                  className="button"
                  type="button"
                  disabled={loading}
                  onClick={() => handleRemove(member.id)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EventAttendance;