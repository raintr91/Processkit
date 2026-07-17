import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SKILLS_BY_TYPE, type ProcesskitType } from './harness.js'

const NON_PORTABLE = /(\.\.\/|~\/|\/home\/|[A-Za-z]:\\|\\\\)/

const EMPTY_LEGACY = {
  description: 'Optional legacy checkouts for process evidence — empty for base/greenfield',
  defaultProject: null,
  projects: {},
}

export function seedProjectMaps(root: string, type: ProcesskitType): {
  platformRepos: string
  legacyRepos?: string
} {
  const projectRoot = path.resolve(root)
  const platformFile = path.join(projectRoot, 'platform-repos.json')
  let platform: any = existsSync(platformFile)
    ? JSON.parse(readFileSync(platformFile, 'utf8'))
    : {
        defaultGroup: type,
        harness: { profiles: {} },
        groups: {
          [type]: {
            description: `${type} current repository only`,
            primary: path.basename(projectRoot),
            projects: [path.basename(projectRoot)],
          },
        },
        projects: {
          [path.basename(projectRoot)]: {
            root: '.',
            role: type,
            repo: path.basename(projectRoot),
            write: true,
          },
        },
      }
  if (NON_PORTABLE.test(JSON.stringify(platform))) {
    throw new Error(
      'platform-repos.json contains a non-portable path; move machine roots to platform-repos.local.json',
    )
  }
  platform.harness ??= {}
  platform.harness.profiles ??= {}
  platform.harness.profiles[type] ??= { groups: [type], skills: [] }
  const skills: string[] = platform.harness.profiles[type].skills ?? []
  for (const skill of SKILLS_BY_TYPE[type]) if (!skills.includes(skill)) skills.push(skill)
  platform.harness.profiles[type].skills = skills
  writeFileSync(platformFile, `${JSON.stringify(platform, null, 2)}\n`)

  let legacyFile: string | undefined
  if (type === 'docs') {
    legacyFile = path.join(projectRoot, 'legacy-repos.json')
    const example = path.join(projectRoot, 'legacy-repos.example.json')
    if (!existsSync(legacyFile)) writeFileSync(legacyFile, `${JSON.stringify(EMPTY_LEGACY, null, 2)}\n`)
    if (!existsSync(example)) writeFileSync(example, `${JSON.stringify(EMPTY_LEGACY, null, 2)}\n`)
  }
  return { platformRepos: platformFile, legacyRepos: legacyFile }
}
