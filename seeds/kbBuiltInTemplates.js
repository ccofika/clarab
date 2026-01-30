const KBTemplate = require('../models/KBTemplate');

const builtInTemplates = [
  {
    title: 'Meeting Notes',
    description: 'Structured meeting notes with agenda, attendees, action items and decisions.',
    icon: '📝',
    category: 'meeting',
    isPublic: true,
    isBuiltIn: true,
    tags: ['meeting', 'notes', 'agenda'],
    blocks: [
      { id: 'mt1', type: 'heading_1', defaultContent: 'Meeting Notes', variants: {}, properties: {} },
      { id: 'mt2', type: 'callout', defaultContent: { text: '**Date:** \n**Time:** \n**Location:**' }, variants: {}, properties: { variant: 'info' } },
      { id: 'mt3', type: 'heading_2', defaultContent: 'Attendees', variants: {}, properties: {} },
      { id: 'mt4', type: 'bulleted_list', defaultContent: '- [ ] Name 1\n- [ ] Name 2\n- [ ] Name 3', variants: {}, properties: {} },
      { id: 'mt5', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'mt6', type: 'heading_2', defaultContent: 'Agenda', variants: {}, properties: {} },
      { id: 'mt7', type: 'numbered_list', defaultContent: '1. Topic 1\n2. Topic 2\n3. Topic 3', variants: {}, properties: {} },
      { id: 'mt8', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'mt9', type: 'heading_2', defaultContent: 'Discussion Notes', variants: {}, properties: {} },
      { id: 'mt10', type: 'paragraph', defaultContent: 'Add your notes here...', variants: {}, properties: {} },
      { id: 'mt11', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'mt12', type: 'heading_2', defaultContent: 'Action Items', variants: {}, properties: {} },
      { id: 'mt13', type: 'table', defaultContent: { headers: ['Action Item', 'Owner', 'Due Date', 'Status'], rows: [['', '', '', 'Pending'], ['', '', '', 'Pending']] }, variants: {}, properties: {} },
      { id: 'mt14', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'mt15', type: 'heading_2', defaultContent: 'Decisions Made', variants: {}, properties: {} },
      { id: 'mt16', type: 'bulleted_list', defaultContent: '- Decision 1\n- Decision 2', variants: {}, properties: {} },
      { id: 'mt17', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'mt18', type: 'callout', defaultContent: { text: '**Next meeting:** TBD' }, variants: {}, properties: { variant: 'tip' } }
    ]
  },
  {
    title: 'Project Brief',
    description: 'Complete project brief with objectives, scope, timeline, risks and deliverables.',
    icon: '🚀',
    category: 'project',
    isPublic: true,
    isBuiltIn: true,
    tags: ['project', 'brief', 'planning'],
    blocks: [
      { id: 'pb1', type: 'heading_1', defaultContent: 'Project Brief', variants: {}, properties: {} },
      { id: 'pb2', type: 'callout', defaultContent: { text: '**Project Name:** \n**Project Lead:** \n**Start Date:** \n**Target Completion:**' }, variants: {}, properties: { variant: 'info' } },
      { id: 'pb3', type: 'heading_2', defaultContent: 'Overview', variants: {}, properties: {} },
      { id: 'pb4', type: 'paragraph', defaultContent: 'Provide a brief summary of the project, its purpose and why it matters.', variants: {}, properties: {} },
      { id: 'pb5', type: 'heading_2', defaultContent: 'Objectives', variants: {}, properties: {} },
      { id: 'pb6', type: 'numbered_list', defaultContent: '1. Objective 1\n2. Objective 2\n3. Objective 3', variants: {}, properties: {} },
      { id: 'pb7', type: 'heading_2', defaultContent: 'Scope', variants: {}, properties: {} },
      { id: 'pb8', type: 'paragraph', defaultContent: 'Define what is included and excluded from this project.', variants: {}, properties: {} },
      { id: 'pb9', type: 'callout', defaultContent: { text: '**In Scope:**\n- Item 1\n- Item 2\n\n**Out of Scope:**\n- Item 1' }, variants: {}, properties: { variant: 'warning' } },
      { id: 'pb10', type: 'heading_2', defaultContent: 'Timeline & Milestones', variants: {}, properties: {} },
      { id: 'pb11', type: 'table', defaultContent: { headers: ['Milestone', 'Target Date', 'Status'], rows: [['Phase 1', '', 'Not Started'], ['Phase 2', '', 'Not Started'], ['Launch', '', 'Not Started']] }, variants: {}, properties: {} },
      { id: 'pb12', type: 'heading_2', defaultContent: 'Team', variants: {}, properties: {} },
      { id: 'pb13', type: 'table', defaultContent: { headers: ['Role', 'Name', 'Responsibilities'], rows: [['Project Lead', '', ''], ['Developer', '', ''], ['Designer', '', '']] }, variants: {}, properties: {} },
      { id: 'pb14', type: 'heading_2', defaultContent: 'Risks & Mitigation', variants: {}, properties: {} },
      { id: 'pb15', type: 'table', defaultContent: { headers: ['Risk', 'Impact', 'Likelihood', 'Mitigation'], rows: [['', 'High', 'Medium', '']] }, variants: {}, properties: {} },
      { id: 'pb16', type: 'heading_2', defaultContent: 'Success Criteria', variants: {}, properties: {} },
      { id: 'pb17', type: 'bulleted_list', defaultContent: '- Criteria 1\n- Criteria 2\n- Criteria 3', variants: {}, properties: {} }
    ]
  },
  {
    title: 'Wiki Page',
    description: 'Documentation page with table of contents, sections, and structured content.',
    icon: '📖',
    category: 'docs',
    isPublic: true,
    isBuiltIn: true,
    tags: ['wiki', 'documentation', 'guide'],
    blocks: [
      { id: 'wp1', type: 'heading_1', defaultContent: 'Page Title', variants: {}, properties: {} },
      { id: 'wp2', type: 'callout', defaultContent: { text: 'Brief description of what this page covers.' }, variants: {}, properties: { variant: 'info' } },
      { id: 'wp3', type: 'table_of_contents', defaultContent: { title: 'Table of Contents', maxDepth: 3, showNumbers: false }, variants: {}, properties: {} },
      { id: 'wp4', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'wp5', type: 'heading_2', defaultContent: 'Introduction', variants: {}, properties: {} },
      { id: 'wp6', type: 'paragraph', defaultContent: 'Provide an introduction to the topic.', variants: {}, properties: {} },
      { id: 'wp7', type: 'heading_2', defaultContent: 'Getting Started', variants: {}, properties: {} },
      { id: 'wp8', type: 'paragraph', defaultContent: 'Step-by-step instructions to get started.', variants: {}, properties: {} },
      { id: 'wp9', type: 'heading_3', defaultContent: 'Prerequisites', variants: {}, properties: {} },
      { id: 'wp10', type: 'bulleted_list', defaultContent: '- Prerequisite 1\n- Prerequisite 2', variants: {}, properties: {} },
      { id: 'wp11', type: 'heading_3', defaultContent: 'Installation', variants: {}, properties: {} },
      { id: 'wp12', type: 'code', defaultContent: { code: '# Installation commands here\nnpm install package-name', language: 'bash' }, variants: {}, properties: { language: 'bash' } },
      { id: 'wp13', type: 'heading_2', defaultContent: 'Configuration', variants: {}, properties: {} },
      { id: 'wp14', type: 'paragraph', defaultContent: 'Explain configuration options and settings.', variants: {}, properties: {} },
      { id: 'wp15', type: 'heading_2', defaultContent: 'Usage', variants: {}, properties: {} },
      { id: 'wp16', type: 'paragraph', defaultContent: 'Provide examples and usage patterns.', variants: {}, properties: {} },
      { id: 'wp17', type: 'heading_2', defaultContent: 'Troubleshooting', variants: {}, properties: {} },
      { id: 'wp18', type: 'toggle', defaultContent: { title: 'Common Issue 1', body: 'Solution for common issue 1.' }, variants: {}, properties: {} },
      { id: 'wp19', type: 'toggle', defaultContent: { title: 'Common Issue 2', body: 'Solution for common issue 2.' }, variants: {}, properties: {} },
      { id: 'wp20', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'wp21', type: 'callout', defaultContent: { text: 'Need help? Contact the team.' }, variants: {}, properties: { variant: 'tip' } }
    ]
  },
  {
    title: 'FAQ Page',
    description: 'Frequently asked questions page with toggle sections for each Q&A pair.',
    icon: '❓',
    category: 'docs',
    isPublic: true,
    isBuiltIn: true,
    tags: ['faq', 'questions', 'help'],
    blocks: [
      { id: 'fq1', type: 'heading_1', defaultContent: 'Frequently Asked Questions', variants: {}, properties: {} },
      { id: 'fq2', type: 'paragraph', defaultContent: 'Find answers to the most common questions below. Click on a question to expand the answer.', variants: {}, properties: {} },
      { id: 'fq3', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'fq4', type: 'heading_2', defaultContent: 'General', variants: {}, properties: {} },
      { id: 'fq5', type: 'toggle', defaultContent: { title: 'What is this product/service?', body: 'Add a description of your product or service here.' }, variants: {}, properties: {} },
      { id: 'fq6', type: 'toggle', defaultContent: { title: 'How do I get started?', body: 'Provide step-by-step instructions for getting started.' }, variants: {}, properties: {} },
      { id: 'fq7', type: 'toggle', defaultContent: { title: 'Is there a free trial?', body: 'Describe your pricing or trial options.' }, variants: {}, properties: {} },
      { id: 'fq8', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'fq9', type: 'heading_2', defaultContent: 'Account & Billing', variants: {}, properties: {} },
      { id: 'fq10', type: 'toggle', defaultContent: { title: 'How do I reset my password?', body: 'Instructions for password reset.' }, variants: {}, properties: {} },
      { id: 'fq11', type: 'toggle', defaultContent: { title: 'How do I update my billing info?', body: 'Steps to update billing information.' }, variants: {}, properties: {} },
      { id: 'fq12', type: 'toggle', defaultContent: { title: 'Can I cancel my subscription?', body: 'Information about cancellation.' }, variants: {}, properties: {} },
      { id: 'fq13', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'fq14', type: 'heading_2', defaultContent: 'Technical', variants: {}, properties: {} },
      { id: 'fq15', type: 'toggle', defaultContent: { title: 'What browsers are supported?', body: 'List of supported browsers and versions.' }, variants: {}, properties: {} },
      { id: 'fq16', type: 'toggle', defaultContent: { title: 'Is my data secure?', body: 'Information about security measures.' }, variants: {}, properties: {} },
      { id: 'fq17', type: 'toggle', defaultContent: { title: 'How do I report a bug?', body: 'Instructions for reporting bugs.' }, variants: {}, properties: {} },
      { id: 'fq18', type: 'divider', defaultContent: '', variants: {}, properties: {} },
      { id: 'fq19', type: 'callout', defaultContent: { text: "Can't find what you're looking for? Contact our support team." }, variants: {}, properties: { variant: 'tip' } }
    ]
  }
];

async function seedBuiltInTemplates() {
  try {
    const existingCount = await KBTemplate.countDocuments({ isBuiltIn: true });
    if (existingCount >= builtInTemplates.length) {
      return;
    }

    for (const template of builtInTemplates) {
      const exists = await KBTemplate.findOne({ title: template.title, isBuiltIn: true });
      if (!exists) {
        await KBTemplate.create(template);
        console.log(`  Seeded built-in template: ${template.title}`);
      }
    }
  } catch (error) {
    console.error('Error seeding built-in templates:', error.message);
  }
}

module.exports = { seedBuiltInTemplates, builtInTemplates };
