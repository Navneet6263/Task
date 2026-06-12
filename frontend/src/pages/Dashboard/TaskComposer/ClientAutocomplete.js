import React, { useState, useEffect, useRef } from 'react';
import { tasks } from '../../../services/api';

const ClientAutocomplete = ({ value, onChange, placeholder = "Enter client or project name" }) => {
  const [clients, setClients] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef(null);

  const loadClients = () => {
    tasks.getClients()
      .then(res => setClients(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  };

  useEffect(() => {
    loadClients();
    
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredClients = clients.filter(c => 
    c && String(c).toLowerCase().includes((value || '').toLowerCase())
  );

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input 
        type="text"
        className="h-[42px] rounded-xl border-2 border-gray-200 bg-white text-gray-900 text-sm px-3.5 focus:border-[#2f5dff] focus:ring-3 focus:ring-blue-50 transition-all outline-none w-full"
        placeholder={placeholder}
        value={value || ''}
        onChange={(e) => {
          onChange(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => {
          loadClients();
          setShowDropdown(true);
        }}
      />
      
      {showDropdown && filteredClients.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-auto py-1 custom-scrollbar">
          {filteredClients.map((client, idx) => (
            <li 
              key={idx}
              className="px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-600 cursor-pointer font-medium transition-colors"
              onClick={() => {
                onChange(client);
                setShowDropdown(false);
              }}
            >
              {client}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ClientAutocomplete;
