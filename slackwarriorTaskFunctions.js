'use strict'
const datejs = require('date.js');
const moment = require('moment');

const REGEX_ALL_WHITESPACE_THAT_IS_NOT_QUOTED = /\s+(?=([^"]*"[^"]*")*[^"]*$)/g
const REGEX_FIRST_COLON_THAT_IS_NOT_QUOTED = /:+(?=([^"]*"[^"]*")*[^"]*$)/

// resolve a modifier name (incl. all possible shorthand versions)
const resolveModifierShorthand = (m) => {
  let modifier = m;
  const modifiers = {
    priority: 'priority',
    priorit: 'priority',
    priori: 'priority',
    prior: 'priority',
    prio: 'priority',
    pri: 'priority',
    project: 'project',
    projec: 'project',
    proje: 'project',
    proj: 'project',
    pro: 'project',
    description: 'description',
    descriptio: 'description',
    descripti: 'description',
    descript: 'description',
    descrip: 'description',
    descri: 'description',
    descr: 'description',
    desc: 'description',
    des: 'description',
    de: 'description',
    status: 'status',
    statu: 'status',
    stat: 'status',
    due: 'due',
    du: 'due',
    start: 'start',
    star: 'start',
    wait: 'wait',
    wai: 'wait',
    wa: 'wait',
    w: 'wait',
    scheduled: 'scheduled',
    schedule: 'scheduled',
    schedul: 'scheduled',
    schedu: 'scheduled',
    sched: 'scheduled',
    sche: 'scheduled',
    sch: 'scheduled',
    sc: 'scheduled',
  }

  modifier = modifier.toLowerCase()

  return modifiers[modifier];
}

// reolve a value for the field "priority" (incl. all possible shorthand versions)
const resolvePriority = (p) => {
  const prio = p.toLowerCase()
  if (prio === 'h' || prio === 'hi' || prio === 'hig' || prio === 'high') {
    return 'H'
  } else if (prio === 'm' || prio === 'me' || prio === 'med' || prio === 'medi' || prio === 'mediu' || prio === 'medium') {
    return 'M'
  }
  return 'L'
}

// reolve a value for the field status (incl. all possible shorthand versions)
const resolveStatus = (status) => {
  let result = 'pending';
  const statusKeys = {
    pending: 'pending',
    pendin: 'pending',
    pendi: 'pending',
    pend: 'pending',
    pen: 'pending',
    pe: 'pending',
    p: 'pending',
    completed: 'completed',
    complete: 'completed',
    complet: 'completed',
    comple: 'completed',
    compl: 'completed',
    comp: 'completed',
    com: 'completed',
    co: 'completed',
    c: 'completed',
    waiting: 'waiting',
    waitin: 'waiting',
    waiti: 'waiting',
    wait: 'waiting',
    wai: 'waiting',
    wa: 'waiting',
    w: 'waiting',
    deleted: 'deleted',
    delete: 'deleted',
    delet: 'deleted',
    dele: 'deleted',
    del: 'deleted',
    de: 'deleted',
    d: 'deleted',
  }

  result = status.toLowerCase()
  if (statusKeys[result]) {
    result = statusKeys[status]
  }

  return status
}

// converts a single task into a Slack message attachment
const task2attachment = (task) => {
  // basic settings for one attachment in the result message
  const attachment = {
    fallback: 'this did not work for some reason',
    fields: [
      {
        title: 'id',
        short: true,
      },
      {
        title: 'project / tag(s)',
        short: true,
      },
    ],
  }

  // create a link to inthe.am in ID field
  attachment.fields[0].value = `<https://inthe.am/tasks/${task.id}|${task.short_id}>`;

  // set project and tags (if any)
  let taskProject = task.project;
  if (task.tags) {
    taskProject = `${taskProject}/`
    for (let j = 0; j < task.tags.length; j++) {
      const tag = task.tags[j];
      taskProject = taskProject + tag
      if (j < task.tags.length - 1) {
        taskProject = `${taskProject}, `
      }
    }
  }
  attachment.fields[1].value = taskProject;

  let title = task.description;
  if (task.start) {
    title = `${title} (active)`
  }
  attachment.title = title;

  // set the color according to the priority of the task
  if (task.priority === 'H') {
    attachment.color = 'danger'
  }
  if (task.priority === 'M') {
    attachment.color = 'warning'
  }

  // format entry- and modified-date
  const entry = moment(task.entry);
  const entryDiff = entry.fromNow()

  const modified = moment(task.modified);
  const modifiedDiff = modified.fromNow()

  const text = `Created: ${entry.format('ll')} (${entryDiff}) / Modified: ${modified.format('ll')} (${modifiedDiff})`;

  attachment.text = text;

  return attachment;
}

// add one line with modifier details to the given text
const addDetailLine = (text, label, value, diff) => {
  if (value) {
    let line = `${text}${label.padRight(19, ' ')}${value}`
    if (diff) {
      line = `${line} (${diff})`
    }
    return `${line}\n`
  }
  return text
}

// create an attachment with details for a single task
const task2details = (task) => {
  const attachment = {
    fallback: 'this did not work for some reason',
    mrkdwn_in: ['text', 'pretext'],
  }

  // set the color according to the priority of the task
  if (task.priority === 'H') {
    attachment.color = 'danger'
  }
  if (task.priority === 'M') {
    attachment.color = 'warning'
  }

  // format entry-, start- and modified-date and the deltas
  let entry = moment(task.entry);
  const entryDiff = entry.fromNow();
  entry = entry.format('llll')
  let modified = moment(task.modified);
  const modifiedDiff = modified.fromNow()
  modified = modified.format('llll')
  let start;
  let startDiff = '';
  if (task.start) {
    start = moment(task.start);
    startDiff = start.fromNow()
    start = start.format('llll')
  }
  let due;
  let dueDiff = '';
  if (task.due) {
    due = moment(task.due);
    dueDiff = due.fromNow()
    due = due.format('llll')
  }
  let wait;
  let waitDiff = '';
  if (task.wait) {
    wait = moment(task.wait);
    waitDiff = wait.fromNow()
    wait = wait.format('llll')
  }
  let scheduled;
  let scheduledDiff = '';
  if (task.scheduled) {
    scheduled = moment(task.scheduled);
    scheduledDiff = scheduled.fromNow()
    scheduled = scheduled.format('llll')
  }

  attachment.title = `Details for task <https://inthe.am/tasks/${task.id}|${task.short_id}>`
  let text = '```';
  text = addDetailLine(text, 'ID', task.short_id)
  let description = task.description
  if (task.start) {
    description = `${description} (active)`
  }

  text = addDetailLine(text, 'Description', description)

  text = addDetailLine(text, 'Status', task.status)
  text = addDetailLine(text, 'Project', task.project)
  text = addDetailLine(text, 'Entered', entry, entryDiff)
  text = addDetailLine(text, 'Start', start, startDiff)
  text = addDetailLine(text, 'Wait', wait, waitDiff)
  text = addDetailLine(text, 'Scheduled', scheduled, scheduledDiff)
  text = addDetailLine(text, 'Due', due, dueDiff)
  text = addDetailLine(text, 'Last Modified', modified, modifiedDiff)

  if (task.tags) {
    let tags = '';
    text = text + 'Tags'.padRight(19, ' ')
    for (let j = 0; j < task.tags.length; j++) {
      const tag = task.tags[j];
      tags = `${tags}${tag} `
    }
    text = `${text}${tags}\n`
  }

  text = addDetailLine(text, 'UUID', task.uuid)
  text = addDetailLine(text, 'Urgency', task.urgency)

  if (task.priority) {
    text = addDetailLine(text, 'Priority', task.priority)
  }

  if (task.annotations && task.annotations.length && task.annotations.length > 0) {
    text = `${text}Annotations\n`

    for (let j = 0; j < task.annotations.length; j++) {
      const annotation = task.annotations[j];
      text = `${text} - ${annotation}\n`
    }
  }
  attachment.text = `${text}\`\`\``;

  return attachment
}

// convert a command line (from adding or modifying tasks) into a task object
const cl2task = (cl, oldTask, annotation) => {
  let commandLine = cl;
  // initialize a task object with default priority = 'L'
  let result = {
    description: '',
    priority: 'L',
    tags: [],
  };
  // if we're updating a task remember the old values
  if (oldTask) {
    result = oldTask;
  }

  // initialize an empty array for tags
  if (!result.tags) {
    result.tags = []
  }

  // replace all whitespace characters which are not quoted with a special squence
  commandLine = commandLine.replace(REGEX_ALL_WHITESPACE_THAT_IS_NOT_QUOTED, '__|__')

  // split the command line into tokens
  const tokens = commandLine.split('__|__')
  // empty array for text in the command line - could be description or annotation
  const descriptionParts = []

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    // if it was a modifier replace the first colon with a special sequence
    token = token.replace(REGEX_FIRST_COLON_THAT_IS_NOT_QUOTED, '__|__')
    // split into key and value
    if (token.indexOf('__|__') > -1) {
      let key = token.split('__|__')[0];
      let value = token.split('__|__')[1];

      // try to resolve the key if it was a shorthand version
      key = resolveModifierShorthand(key);

      // if the value was quotes, remove the quotes here
      if (value.indexOf('"') > -1) {
        value = value.replace('"', '')
      }
      // special handling for "priority" which has some shorthand versions
      if (key === 'priority') {
        value = resolvePriority(value)
        result[key] = value;
      // special handling for "status" which has some shorthand versions
      } else if (key === 'status') {
        value = resolveStatus(value)
        result[key] = value;
      // if we're modifying a description
      } else if (key === 'description') {
        descriptionParts.push(value)
      // in case of date values convert a given "human" date into a datetime object
      } else if (key === 'due' || key === 'wait' || key === 'start' || key === 'scheduled') {
        value = datejs(value)
        result[key] = value;
      // in any other case just add to the result
      } else {
        result[key] = value;
      }

    // if we're adding a tag
    } else if (token.startsWith('+')) {
      const tag = token.split('+')[1]
      // if the tag is not already in the list of tags
      if (result.tags.indexOf(tag) === -1) {
        result.tags.push(tag)
      }
    // if we're removing a tag
    } else if (token.startsWith('-')) {
      const tag = token.split('-')[1]
      const index = result.tags.indexOf(tag)
      // if the tag is in the list, remove it
      if (index > -1) {
        result.tags.splice(index, 1);
      }
    // if it was none of the above we're creating a new task and this part of the description or annotation
    } else {
      descriptionParts.push(token)
    }
  }
  // if there were text parts and the parameter "annotation" is not true
  if (descriptionParts.length > 0 && !annotation) {
    result.description = descriptionParts.join(' ').trim()
  }

  // if the parameter "annotation" was true, the text parts of the commandline will be considered to be an annotation
  if (annotation) {
    if (!result.annotations) {
      result.annotations = []
    }
    result.annotations.push(descriptionParts.join(' ').trim())
  }

  return result;
}

module.exports.cl2task = cl2task;
module.exports.task2attachment = task2attachment;
module.exports.task2details = task2details
