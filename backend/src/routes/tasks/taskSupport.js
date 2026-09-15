const express = require('express');
const db = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { canAccessTeam, requireTeamAccess } = require('../../utils/teamAccess');
const { getTaskDetail, listTeamTasks } = require('../../services/taskQueryService');
const ws = require('../../websocket');

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'PENDING', 'DONE'];
const TASK_ISSUE_TYPES = ['task', 'bug', 'story', 'feature', 'enhancement'];
const TASK_OPTION_GROUPS = {
  task_type: 'task_types',
  product: 'products',
  category: 'categories',
};
const DEFAULT_TASK_FORM_OPTIONS = {
  task_type: [
    { label: 'Feature', parent_value: '' },
    { label: 'Improvement', parent_value: '' },
    { label: 'Testing', parent_value: '' },
    { label: 'Research', parent_value: '' },
  ],
  product: [
    { label: 'Dashboard', parent_value: '' },
    { label: 'UI/UX', parent_value: '' },
    { label: 'Backend API', parent_value: '' },
    { label: 'Mobile App', parent_value: '' },
    { label: 'Authentication', parent_value: '' },
    { label: 'Reports', parent_value: '' },
  ],
  category: [
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
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REFERENCE_IMAGE_LENGTH = 900000;

const normalizeText = (value, maxLength = 255) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const normalizeDate = (value, fieldName) => {
  if (!value) return null;
  const normalized = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim().slice(0, 10);
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!DATE_PATTERN.test(normalized) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return normalized;
};

const normalizeIssueType = (value) => {
  if (!value) return 'task';
  const normalized = String(value).trim().toLowerCase();
  if (!TASK_ISSUE_TYPES.includes(normalized)) {
    throw new Error('issue_type must be task, bug, story, feature, or enhancement');
  }
  return normalized;
};

const normalizeReferenceImage = (value) => {
  if (!value) return null;
  if (typeof value !== 'string' || !value.startsWith('data:image/')) {
    throw new Error('reference_image must be a valid image');
  }
  if (value.length > MAX_REFERENCE_IMAGE_LENGTH) {
    throw new Error('Reference image is too large. Please upload a smaller image.');
  }
  return value;
};

const normalizeUserId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new Error('assigned_to must be a valid user');
  }
  return normalized;
};

const normalizeTaskPayload = (payload = {}) => {
  const title = normalizeText(payload.title, 255);
  const description = normalizeText(payload.description, 5000);
  const priority = ['LOW', 'MEDIUM', 'HIGH'].includes(payload.priority) ? payload.priority : 'MEDIUM';
  const taskType = normalizeText(payload.task_type, 120);
  const product = normalizeText(payload.product, 120);
  const category = normalizeText(payload.category, 120);
  const assignedDate = normalizeDate(payload.assigned_date, 'assigned_date') || new Date().toISOString().slice(0, 10);
  const startDate = normalizeDate(payload.start_date, 'start_date');
  const dueDate = normalizeDate(payload.due_date, 'due_date');

  if (startDate && dueDate && startDate > dueDate) {
    throw new Error('End date must be after start date');
  }
  if (assignedDate && dueDate && assignedDate > dueDate) {
    throw new Error('Assigned date must be on or before end date');
  }

  return {
    title,
    description,
    priority,
    issueType: normalizeIssueType(payload.issue_type),
    taskType,
    product,
    category,
    assignedDate,
    startDate,
    dueDate,
    referenceImage: normalizeReferenceImage(payload.reference_image),
    // shared
    clientName:         normalizeText(payload.client_name, 255),
    // bug fields
    severity:           normalizeText(payload.severity, 20),
    bugType:            normalizeText(payload.bug_type, 50),
    environment:        normalizeText(payload.environment, 30),
    affectedModule:     normalizeText(payload.affected_module, 255),
    stepsToReproduce:   normalizeText(payload.steps_to_reproduce, 5000),
    // feature fields
    featureArea:        normalizeText(payload.feature_area, 50),
    storyPoints:        normalizeText(payload.story_points, 10),
    featurePriority:    normalizeText(payload.feature_priority, 30),
    acceptanceCriteria: normalizeText(payload.acceptance_criteria, 5000),
    // enhancement fields
    enhancementType:    normalizeText(payload.enhancement_type, 50),
    impactLevel:        normalizeText(payload.impact_level, 20),
    effortEstimate:     normalizeText(payload.effort_estimate, 10),
    improvementDetail:  normalizeText(payload.improvement_detail, 5000),
    // story fields
    storyRole:          normalizeText(payload.story_role, 50),
    epic:               normalizeText(payload.epic, 255),
    persona:            normalizeText(payload.persona, 255),
    storyNotes:         normalizeText(payload.story_notes, 5000),
  };
};

const canManageTaskForm = (role) => ['admin', 'manager', 'company_admin'].includes(role);

const formatTaskFormOptions = (rows) => {
  const grouped = { task_types: [], products: [], categories: [] };

  rows.forEach((row) => {
    const key = TASK_OPTION_GROUPS[row.option_group];
    if (!key) return;
    grouped[key].push({
      id: row.id,
      label: row.label,
      option_group: row.option_group,
      parent_value: row.parent_value || '',
      sort_order: row.sort_order || 0,
      is_active: Boolean(row.is_active),
    });
  });

  return grouped;
};

const ensureDefaultTaskFormOptions = async (orgId, userId = null) => {
  if (!orgId) return;

  const [[{ total }]] = await db.execute(
    'SELECT COUNT(*) as total FROM task_form_options WHERE org_id = ?',
    [orgId]
  );

  if (total > 0) return;

  for (const [group, options] of Object.entries(DEFAULT_TASK_FORM_OPTIONS)) {
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      await db.execute(
        `INSERT IGNORE INTO task_form_options
         (org_id, option_group, label, parent_value, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orgId, group, option.label, option.parent_value || '', index + 1, userId]
      );
    }
  }
};

async function logActivity(userId, teamId, taskId, activity, taskDetails, description, automatedBy) {
  try {
    await db.execute(
      'INSERT INTO audit_logs (user_id, team_id, task_id, activity, task_details, description, automated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, teamId, taskId, activity, taskDetails, description, automatedBy]
    );
  } catch (e) {}
}


module.exports = { express, db, authenticate, canAccessTeam, requireTeamAccess, getTaskDetail, listTeamTasks, ws, TASK_STATUSES, TASK_ISSUE_TYPES, normalizeText, normalizeDate, normalizeIssueType, normalizeReferenceImage, normalizeUserId, normalizeTaskPayload, canManageTaskForm, formatTaskFormOptions, ensureDefaultTaskFormOptions, TASK_OPTION_GROUPS, logActivity };
