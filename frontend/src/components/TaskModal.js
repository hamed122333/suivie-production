import React, { useState, useEffect } from 'react';

const TaskModal = ({ isOpen, task, onClose, onSave, users }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    assignee: '',
    status: 'TODO',
    blocked_reason: ''
  });

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description || '',
        priority: task.priority || 'MEDIUM',
        assignee: task.assignee || '',
        status: task.status || 'TODO',
        blocked_reason: task.blocked_reason || ''
      });
    } else {
      setFormData({
        title: '', description: '', priority: 'MEDIUM', assignee: '', status: 'TODO', blocked_reason: ''
      });
    }
  }, [task, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...formData, id: task ? task.id : undefined });
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
    }}>
      <div style={{ backgroundColor: 'white', padding: 20, borderRadius: 8, width: '400px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2>{task ? 'Edit Task' : 'New Task'}</h2>
        <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 10 }}>
                <label>Title</label>
                <input required name="title" value={formData.title} onChange={handleChange} style={{ width: '100%', padding: 8 }} />
            </div>
            <div style={{ marginBottom: 10 }}>
                <label>Description</label>
                <textarea name="description" value={formData.description} onChange={handleChange} style={{ width: '100%', padding: 8 }} />
            </div>
            <div style={{ marginBottom: 10 }}>
                <label>Assignee</label>
                <select name="assignee" value={formData.assignee} onChange={handleChange} style={{ width: '100%', padding: 8 }}>
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                </select>
            </div>
            <div style={{ marginBottom: 10 }}>
                <label>Priority</label>
                <select name="priority" value={formData.priority} onChange={handleChange} style={{ width: '100%', padding: 8 }}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                </select>
            </div>
            {task && (
                 <div style={{ marginBottom: 10 }}>
                    <label>Status</label>
                    <select name="status" value={formData.status} onChange={handleChange} style={{ width: '100%', padding: 8 }}>
                        <option value="TODO">To Do</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="DONE">Done</option>
                        <option value="BLOCKED">Blocked</option>
                    </select>
                </div>
            )}
            {formData.status === 'BLOCKED' && (
                <div style={{ marginBottom: 10 }}>
                    <label style={{ color: 'red' }}>Blocked Reason</label>
                    <input required name="blocked_reason" value={formData.blocked_reason} onChange={handleChange} style={{ width: '100%', padding: 8, border: '1px solid red' }} />
                </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                <button type="button" onClick={onClose} style={{ padding: '8px 16px' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: 4 }}>Save</button>
            </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;

