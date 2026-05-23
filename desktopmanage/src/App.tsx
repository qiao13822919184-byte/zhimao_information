/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2, 
  MessageSquare, 
  Calendar, 
  ChevronDown, 
  ChevronUp,
  LayoutGrid,
  MoreVertical,
  CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  remarks: string;
  createdAt: number;
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('widget-tasks');
    return saved ? JSON.parse(saved) : [];
  });
  const [inputValue, setInputValue] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('widget-tasks', JSON.stringify(tasks));
  }, [tasks]);

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      text: inputValue.trim(),
      completed: false,
      remarks: '',
      createdAt: Date.now(),
    };
    setTasks([newTask, ...tasks]);
    setInputValue('');
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const updateRemarks = (id: string, remarks: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, remarks } : t));
  };

  const completionPercentage = useMemo(() => {
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.completed).length;
    return Math.round((completed / tasks.length) * 100);
  }, [tasks]);

  const today = new Date().toLocaleDateString('zh-CN', { 
    month: 'long', 
    day: 'numeric', 
    weekday: 'short' 
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8">
      {/* Widget Container */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-card rounded-[32px] widget-shadow overflow-hidden flex flex-col"
        id="widget-container"
      >
        {/* Header */}
        <div className="p-6 pb-4 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Calendar size={14} className="opacity-70" />
              <span className="text-xs font-medium tracking-tight uppercase">{today}</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
              Daily Focus
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            </h1>
          </div>
          <div className="p-2 hover:bg-slate-100 rounded-full cursor-pointer transition-colors">
            <LayoutGrid size={20} className="text-slate-400" />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="px-6 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-slate-500">Progress</span>
            <span className="text-xs font-bold text-blue-600">{completionPercentage}%</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${completionPercentage}%` }}
              className="h-full bg-blue-500 rounded-full"
            />
          </div>
        </div>

        {/* Task Input */}
        <form onSubmit={addTask} className="px-6 mb-6">
          <div className="relative group">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="What to focus on today?"
              className="w-full bg-slate-50/80 border border-slate-200/60 rounded-2xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all placeholder:text-slate-400"
            />
            <button 
              type="submit"
              className="absolute right-2 top-1.5 p-1.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors shadow-sm group-hover:scale-105 active:scale-95"
            >
              <Plus size={18} />
            </button>
          </div>
        </form>

        {/* List Section */}
        <div className="flex-1 overflow-y-auto px-4 pb-8 max-h-[500px] scrollbar-hide">
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {tasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`relative flex flex-col p-4 rounded-2xl border transition-all ${
                    task.completed 
                    ? 'bg-slate-50/50 border-slate-100' 
                    : 'bg-white border-slate-100 shadow-sm hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => toggleTask(task.id)}
                      className={`flex-shrink-0 transition-colors ${task.completed ? 'text-green-500' : 'text-slate-300 hover:text-slate-400'}`}
                    >
                      {task.completed ? <CheckCircle2 size={22} fill="currentColor" className="text-green-100" /> : <Circle size={22} />}
                    </button>
                    
                    <span className={`flex-1 text-sm font-medium transition-all ${task.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {task.text}
                    </span>

                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                        className={`p-1.5 rounded-lg transition-colors ${expandedTaskId === task.id ? 'bg-slate-100 text-slate-600' : 'text-slate-300 hover:text-slate-400'}`}
                      >
                        <MessageSquare size={16} />
                      </button>
                      <button 
                        onClick={() => deleteTask(task.id)}
                        className="p-1.5 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Remarks Section */}
                  <AnimatePresence>
                    {expandedTaskId === task.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 pt-3 border-t border-slate-50">
                          <textarea
                            placeholder="Add progress notes or remarks..."
                            value={task.remarks}
                            onChange={(e) => updateRemarks(task.id, e.target.value)}
                            className="w-full bg-slate-50/50 rounded-xl p-3 text-xs text-slate-600 focus:outline-none min-h-[80px] resize-none border border-transparent focus:border-slate-200 transition-all font-mono"
                          />
                          <div className="flex justify-between items-center mt-2 px-1">
                            <span className="text-[10px] text-slate-400 font-mono">
                              ID: {task.id.slice(0, 8)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>

            {tasks.length === 0 && (
              <div className="text-center py-12">
                <div className="inline-flex p-4 bg-slate-50 rounded-full mb-4">
                  <CheckCircle size={32} className="text-slate-200" />
                </div>
                <p className="text-slate-400 text-sm">No tasks for today yet.</p>
                <p className="text-slate-300 text-xs mt-1 italic">Stay focused, stay productive.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Info */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-100/50 flex justify-between items-center text-[10px] text-slate-400 uppercase tracking-widest font-bold">
          <span>Auto-Save Enabled</span>
          <span>{tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'}</span>
        </div>
      </motion.div>
    </div>
  );
}
