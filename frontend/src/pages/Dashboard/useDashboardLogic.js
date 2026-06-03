import { useState, useEffect, useMemo, useCallback } from 'react';
import { tasks } from '../../services/api';

const DEFAULT_TASK_FORM_OPTIONS = {
  task_types: [
    { label: 'Feature', parent_value: '' },
    { label: 'Improvement', parent_value: '' },
    { label: 'Testing', parent_value: '' },
    { label: 'Research', parent_value: '' },
  ],
  products: [
    { label: 'Dashboard', parent_value: '' },
    { label: 'UI/UX', parent_value: '' },
    { label: 'Backend API', parent_value: '' },
    { label: 'Mobile App', parent_value: '' },
    { label: 'Authentication', parent_value: '' },
    { label: 'Reports', parent_value: '' },
  ],
  categories: [
    { label: 'New Feature', parent_value: 'Feature' },
    { label: 'Workflow', parent_value: 'Feature' },
    { label: 'Optimization', parent_value: 'Improvement' },
    { label: 'Refactor', parent_value: 'Improvement' },
    { label: 'Regression', parent_value: 'Testing' },
    { label: 'UAT', parent_value: 'Testing' },
    { label: 'Discovery', parent_value: 'Research' },
    { label: 'Documentation', parent_value: 'Research' },
  ],
};

const MAX_REFERENCE_IMAGE_BYTES = 450 * 1024;

const buildInitialTaskForm = () => {
  const today = new Date().toISOString().split('T')[0];
  return {
    title: '', description: '', priority: 'MEDIUM', assigned_to: '',
    assigned_date: today, start_date: today, due_date: '',
    issue_type: 'task', task_type: '', product: '', category: '',
    reference_image: '', client_name: '',
    // bug fields
    severity: 'MEDIUM', bug_type: '', environment: '', affected_module: '', steps_to_reproduce: '',
    // feature fields
    feature_area: '', story_points: '', feature_priority: '', acceptance_criteria: '',
    // enhancement fields
    enhancement_type: '', impact_level: '', effort_estimate: '', improvement_detail: '',
    // story fields
    story_role: '', epic: '', persona: '', story_notes: '',
  };
};

const initialMgrForm = { title: '', description: '', priority: 'MEDIUM', assigned_to: '', due_date: '' };

const filterCategoryOptions = (options = [], taskType = '') => {
  if (!taskType) return options;
  return options.filter((option) => !option.parent_value || option.parent_value === taskType);
};

export const useDashboardLogic = (selectedTeam, members, orgUsers, setOrgUsers, setShowTaskModal, setShowMgrModal, selectedTask, setSelectedTask, refresh) => {
  const [taskForm, setTaskFormState] = useState(buildInitialTaskForm());
  const [taskFormOptions, setTaskFormOptions] = useState(DEFAULT_TASK_FORM_OPTIONS);
  const [mgrForm, setMgrForm] = useState(initialMgrForm);

  const fetchTaskFormOptions = useCallback(async () => {
    try {
      const response = await tasks.getFormOptions();
      setTaskFormOptions({
        task_types: Array.isArray(response.data?.task_types) && response.data.task_types.length > 0 ? response.data.task_types : DEFAULT_TASK_FORM_OPTIONS.task_types,
        products: Array.isArray(response.data?.products) && response.data.products.length > 0 ? response.data.products : DEFAULT_TASK_FORM_OPTIONS.products,
        categories: Array.isArray(response.data?.categories) && response.data.categories.length > 0 ? response.data.categories : DEFAULT_TASK_FORM_OPTIONS.categories,
      });
    } catch (error) {
      setTaskFormOptions(DEFAULT_TASK_FORM_OPTIONS);
    }
  }, []);

  useEffect(() => { fetchTaskFormOptions(); }, [fetchTaskFormOptions]);

  const updateTaskFormField = (field, value) => {
    setTaskFormState((current) => {
      const next = { ...current, [field]: value };
      if (field === 'task_type') next.category = '';
      return next;
    });
  };

  const handleReferenceImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select a valid image file'); return; }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) { alert('Please upload an image under 450KB'); return; }
    const reader = new FileReader();
    reader.onload = () => { updateTaskFormField('reference_image', typeof reader.result === 'string' ? reader.result : ''); };
    reader.onerror = () => alert('Failed to read the selected image');
    reader.readAsDataURL(file);
  };

  const handleCreateTask = async (event) => {
    event.preventDefault();
    if (!selectedTeam) return;
    try {
      await tasks.create({ ...taskForm, title: taskForm.title.trim(), description: taskForm.description.trim(), team_id: selectedTeam.id, assigned_to: taskForm.assigned_to || null, task_type: taskForm.task_type || null, product: taskForm.product || null, category: taskForm.category || null, assigned_date: taskForm.assigned_date || null, start_date: taskForm.start_date || null, due_date: taskForm.due_date || null, reference_image: taskForm.reference_image || null });
      setShowTaskModal(false);
      setTaskFormState(buildInitialTaskForm());
      await refresh();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create task');
    }
  };

  const handleManagerAssign = async (event) => {
    event.preventDefault();
    try {
      await tasks.managerAssign({ ...mgrForm, team_id: selectedTeam?.id || null });
      setShowMgrModal(false);
      setMgrForm(initialMgrForm);
      await refresh();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to assign');
    }
  };

  const openManagerModal = async () => {
    if (orgUsers.length === 0) {
      try {
        const response = await tasks.getOrgUsers();
        setOrgUsers(Array.isArray(response.data) ? response.data : []);
      } catch (error) {}
    }
    setShowMgrModal(true);
  };

  const openTaskComposer = async () => {
    if (!selectedTeam) return;
    setTaskFormState(buildInitialTaskForm());
    await fetchTaskFormOptions();
    setShowTaskModal(true);
  };

  const handleStatusChange = async (task, status) => {
    try {
      await tasks.update(task.id, { ...task, status });
      await refresh();
    } catch (error) {}
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await tasks.delete(taskId);
      setSelectedTask(null);
      await refresh();
    } catch (error) {}
  };

  const handlePickBug = async (taskId) => {
    try {
      await tasks.pickBug(taskId);
      await refresh();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to pick bug');
    }
  };

  const handleResolveBug = async (taskId) => {
    try {
      await tasks.resolveBug(taskId);
      await refresh();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to resolve bug');
    }
  };

  const handlePanelUpdate = async (field, value) => {
    if (!selectedTask) return;
    const normalized = field === 'assigned_to' ? (value ? Number(value) : null) : value;
    const nextTask = { ...selectedTask, [field]: normalized };
    if (field === 'task_type') nextTask.category = '';
    try {
      await tasks.update(selectedTask.id, { ...nextTask, assigned_to: nextTask.assigned_to || null });
      setSelectedTask(nextTask);
      await refresh();
    } catch (error) {}
  };

  const availableTaskOptions = useMemo(() => ({ task_types: taskFormOptions.task_types?.length ? taskFormOptions.task_types : DEFAULT_TASK_FORM_OPTIONS.task_types, products: taskFormOptions.products?.length ? taskFormOptions.products : DEFAULT_TASK_FORM_OPTIONS.products, categories: taskFormOptions.categories?.length ? taskFormOptions.categories : DEFAULT_TASK_FORM_OPTIONS.categories }), [taskFormOptions]);

  const createTaskCategories = useMemo(() => filterCategoryOptions(availableTaskOptions.categories, taskForm.task_type), [availableTaskOptions.categories, taskForm.task_type]);

  const selectedTaskCategories = useMemo(() => filterCategoryOptions(availableTaskOptions.categories, selectedTask?.task_type), [availableTaskOptions.categories, selectedTask?.task_type]);

  return { taskForm, setTaskForm: setTaskFormState, taskFormOptions, mgrForm, setMgrForm, updateTaskFormField, handleReferenceImageChange, handleCreateTask, handleManagerAssign, handleStatusChange, handleDelete, handlePickBug, handleResolveBug, handlePanelUpdate, openManagerModal, openTaskComposer, availableTaskOptions, createTaskCategories, selectedTaskCategories };
};
