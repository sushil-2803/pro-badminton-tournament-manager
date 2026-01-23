
import React, { useState, useEffect } from 'react';
import { ChevronRight, Users, PlayCircle, Trophy } from 'lucide-react';
import { api } from '../api.js';

const CategoryDashboard = ({ categories, onSelect }) => {
  const [stats, setStats] = useState({});

  useEffect(() => {
    const loadStats = async () => {
      try {
        const allPlayers = await api.getPlayers();
        const newStats = {};

        for (const cat of categories) {
          const catPlayers = allPlayers.filter(p => p.categoryId === cat.id);
          const matches = await api.getMatches(cat.id);
          const completed = matches.length > 0 && matches.every(m => m.status === 'COMPLETED' || m.status === 'BYE');
          
          newStats[cat.id] = {
            count: catPlayers.length,
            completed: completed
          };
        }
        setStats(newStats);
      } catch (err) {
        console.error("Stats load failed", err);
      }
    };
    if (categories.length > 0) loadStats();
  }, [categories]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {categories.map((cat) => {
        const s = stats[cat.id] || { count: 0, completed: false };
        return (
          <div 
            key={cat.id} 
            className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden group hover:border-blue-400 active:scale-[0.98] transition-all hover:shadow-md cursor-pointer"
            onClick={() => onSelect(cat)}
          >
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
                  <Users className="w-5 h-5" />
                </div>
                <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded">
                  {s.count} Players
                </span>
              </div>
              <h4 className="text-lg font-bold text-slate-800 mb-1">{cat.name}</h4>
              <p className="text-sm text-slate-500 mb-6">Single Elimination</p>
              
              <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                <div className={`flex items-center gap-1.5 text-sm font-semibold text-emerald-600`}>
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>{s.count > 1 ? 'Ready' : 'Registering'}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CategoryDashboard;
