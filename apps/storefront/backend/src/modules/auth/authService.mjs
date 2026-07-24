export class AuthService {
  constructor(repository, sessionHours) {
    this.repository = repository
    this.sessionHours = sessionHours
  }

  login(username, pin) {
    const user = this.repository.authenticate(username, pin)
    if (!user) return undefined
    const session = this.repository.createSession(user.id, this.sessionHours)
    return {
      ...session,
      account: {
        id: user.id,
        name: user.name,
        position: user.position || user.role,
        branch: user.branch_id || '',
        systemRole: user.role,
        status: 'active',
        phone: '',
        hireDate: user.hire_date || '2024-01-01',
        username: user.username,
      },
    }
  }

  getSessionFromRequest(req, url) {
    const raw = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const queryToken = url.pathname.endsWith('/stream') ? String(url.searchParams.get('token') || '') : ''
    return this.repository.readSession(raw || queryToken)
  }

  logout(token) { this.repository.deleteSession(token) }
}
