import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(__dirname, '../..')
const GEN_SCRIPT = join(REPO_ROOT, 'scripts/generate-updater-manifest.cjs')
const VERIFY_SCRIPT = join(REPO_ROOT, 'scripts/verify-release-assets.cjs')

const tempDirs: string[] = []

function makeValidMinisignBase64(label: string): string {
  const payload = [
    `untrusted comment: signature from minisign secret key (${label})`,
    'RWT5bX9vQk1pbm1zaWduVGVzdFNpZ25hdHVyZUFCRUNERUZHSElKS0xNTk9QUVJTVFVWV1hZWjAxMjM0NTY3ODk=',
    `trusted comment: timestamp:1795651200\tfile:${label}`,
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
  ].join('\n')
  return Buffer.from(payload, 'utf8').toString('base64')
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function buildReleaseFixture(version = '0.6.0'): string {
  const dir = mkdtempSync(join(tmpdir(), 'kinora-release-fixture-'))
  tempDirs.push(dir)

  const bundles = [
    `Kinora_${version}_amd64.AppImage`,
    `Kinora_${version}_amd64.deb`,
    `Kinora-${version}-1.x86_64.rpm`,
    `Kinora_${version}_x64-setup.exe`,
    `Kinora_${version}_x64_en-US.msi`,
    `Kinora_${version}_aarch64.app.tar.gz`,
    `Kinora_${version}_x64.app.tar.gz`,
  ]
  const signedBundles = new Set([
    `Kinora_${version}_amd64.AppImage`,
    `Kinora_${version}_x64-setup.exe`,
    `Kinora_${version}_aarch64.app.tar.gz`,
    `Kinora_${version}_x64.app.tar.gz`,
  ])

  const checksumLines: string[] = []
  for (const name of bundles) {
    const data = Buffer.from(`KINORA-FIXTURE-BINARY:${name}:${version}`, 'utf8')
    writeFileSync(join(dir, name), data)
    checksumLines.push(`${sha256(data)}  ${name}`)
    if (signedBundles.has(name)) {
      const sigName = `${name}.sig`
      const sigBuf = Buffer.from(makeValidMinisignBase64(name), 'utf8')
      writeFileSync(join(dir, sigName), sigBuf)
      checksumLines.push(`${sha256(sigBuf)}  ${sigName}`)
    }
  }

  writeFileSync(join(dir, 'SHA256SUMS.txt'), `${checksumLines.join('\n')}\n`, 'utf8')
  writeFileSync(
    join(dir, 'kinora-sbom.json'),
    JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5', components: [{ name: 'kinora', version }] }),
    'utf8',
  )

  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('Release manifest generation and asset verification scripts', () => {
  it('generates and verifies a complete 4-platform signed v0.6.0 release bundle', () => {
    const dir = buildReleaseFixture('0.6.0')

    const genOut = execFileSync(process.execPath, [GEN_SCRIPT, '--dist-dir', dir], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    expect(genOut).toContain('latest.json')
    expect(genOut).toContain('"linux-x86_64"')
    expect(genOut).toContain('"darwin-aarch64"')

    const manifest = JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8')) as {
      version: string
      build_commit?: string
      build_timestamp?: number
    }
    expect(manifest.version).toBe('0.6.0')
    expect(manifest.build_commit).toMatch(/^[0-9a-f]{7,40}$/)
    expect(typeof manifest.build_timestamp).toBe('number')
    expect(manifest.build_timestamp).toBeGreaterThan(1_700_000_000)

    const verifyOut = execFileSync(process.execPath, [VERIFY_SCRIPT, '--dir', dir], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
    expect(verifyOut).toContain('[RELEASE VERIFY OK]')
    expect(verifyOut).toContain('v0.6.0')
  })

  it('rejects a bundle with a tampered SHA256SUMS.txt entry', () => {
    const dir = buildReleaseFixture('0.6.0')
    execFileSync(process.execPath, [GEN_SCRIPT, '--dist-dir', dir], { cwd: REPO_ROOT })

    // Tamper with AppImage bytes after checksum generation
    writeFileSync(join(dir, 'Kinora_0.6.0_amd64.AppImage'), Buffer.from('TAMPERED-BYTES', 'utf8'))

    let failed = false
    let stderr = ''
    try {
      execFileSync(process.execPath, [VERIFY_SCRIPT, '--dir', dir], { cwd: REPO_ROOT, encoding: 'utf8' })
    } catch (err) {
      failed = true
      stderr = (err as { stderr?: string }).stderr ?? ''
    }
    expect(failed).toBe(true)
    expect(stderr).toContain('SHA-256 mismatch')
  })

  it('rejects a bundle containing a duplicate unprefixed Kinora.app.tar.gz archive', () => {
    const dir = buildReleaseFixture('0.6.0')
    execFileSync(process.execPath, [GEN_SCRIPT, '--dist-dir', dir], { cwd: REPO_ROOT })
    writeFileSync(join(dir, 'Kinora.app.tar.gz'), Buffer.from('duplicate', 'utf8'))

    let failed = false
    let stderr = ''
    try {
      execFileSync(process.execPath, [VERIFY_SCRIPT, '--dir', dir], { cwd: REPO_ROOT, encoding: 'utf8' })
    } catch (err) {
      failed = true
      stderr = (err as { stderr?: string }).stderr ?? ''
    }
    expect(failed).toBe(true)
    expect(stderr).toContain('Unprefixed Kinora.app.tar.gz')
  })

  it('rejects a bundle when a required platform artifact is missing', () => {
    const dir = buildReleaseFixture('0.6.0')
    execFileSync(process.execPath, [GEN_SCRIPT, '--dist-dir', dir], { cwd: REPO_ROOT })
    rmSync(join(dir, 'Kinora_0.6.0_x64-setup.exe'))

    let failed = false
    let stderr = ''
    try {
      execFileSync(process.execPath, [VERIFY_SCRIPT, '--dir', dir], { cwd: REPO_ROOT, encoding: 'utf8' })
    } catch (err) {
      failed = true
      stderr = (err as { stderr?: string }).stderr ?? ''
    }
    expect(failed).toBe(true)
    expect(stderr).toContain('windows-x86_64')
  })

  it('rejects a bundle with an invalid or corrupted Minisign signature payload', () => {
    const dir = buildReleaseFixture('0.6.0')
    writeFileSync(join(dir, 'Kinora_0.6.0_amd64.AppImage.sig'), 'not-a-valid-minisign-signature', 'utf8')

    let failed = false
    let stderr = ''
    try {
      execFileSync(process.execPath, [GEN_SCRIPT, '--dist-dir', dir], { cwd: REPO_ROOT, encoding: 'utf8' })
    } catch (err) {
      failed = true
      stderr = (err as { stderr?: string }).stderr ?? ''
    }
    expect(failed).toBe(true)
    expect(stderr).toContain('Minisign')
  })
})

it("intentional temporary CI gate failure test", () => { expect(true).toBe(false) })
