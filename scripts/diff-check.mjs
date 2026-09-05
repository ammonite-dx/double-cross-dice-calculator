import { execFileSync } from 'node:child_process'

const base = process.env.DIFF_CHECK_BASE?.trim() ?? ''
const head = process.env.DIFF_CHECK_HEAD?.trim() ?? ''

function runGitDiffCheck(argumentsList, description, command = 'diff') {
  execFileSync('git', [command, '--check', ...argumentsList], {
    stdio: 'inherit',
  })
  console.log(`git diff --check: ${description}`)
}

if (!base && !head) {
  runGitDiffCheck([], 'working tree')
} else if (!base || !head) {
  throw new Error(
    'DIFF_CHECK_BASE and DIFF_CHECK_HEAD must be set together for committed diff verification'
  )
} else if (/^0+$/.test(base)) {
  runGitDiffCheck(['--root', '-r', head], `root commit ${head}`, 'diff-tree')
} else {
  runGitDiffCheck([`${base}..${head}`], `committed range ${base}..${head}`)
}
