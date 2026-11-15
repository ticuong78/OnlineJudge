module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [1, 'always', ['contracts', 'backend', 'engine', 'frontend', 'identity', 'classroom', 'catalog', 'importing', 'assessment', 'integrity', 'community', 'judging', 'ci', 'docs', 'deps']],
    'subject-case': [0],
  },
};
