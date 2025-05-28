/**
 * # Example
 * ```js
 * const limiter = new FixedWindowRateLimiter(redis, {
 *     capacity: 3, // 최대 요청 수
 *     windowMs: 60 * 1000, // 윈도우 지속 시간 (밀리초)
 *     debug: true // 디버그 모드 활성화
 * })
 * ```
 */
class FixedWindowRateLimiter {
    constructor(redis, options = {}) {
        this.redis = redis
        this.capacity = options.capacity ?? 3
        this.windowMs = options.windowMs ?? 60 * 1000
        this.debug = options.debug ?? false
    }

    _log(message) {
        if (this.debug) console.log(message)
    }

    getRedisKey(userId) {
        const windowStart = Math.floor(Date.now() / this.windowMs)
        return `fixed-window:${userId}:${windowStart}`
    }

    getMiddleware() {
        return async (req, res, next) => {
            const userId = req.headers['x-forwarded-for'] ?? req.ip
            if (!userId) return res.status(400).json({ message: 'User ID is required' })

            try {
                const key = this.getRedisKey(userId)
                const count = await this.redis.incr(key)

                if (count === 1) {
                    await this.redis.pexpire(key, this.windowMs)
                }

                res.setHeader('X-RateLimit-Limit', this.capacity)
                res.setHeader('X-RateLimit-Remaining', Math.max(this.capacity - count, 0))
                res.setHeader('X-RateLimit-Reset', Math.ceil(this.windowMs / 1000))

                if (count <= this.capacity) {
                    this._log(`✅ [${userId}] Allowed - Requests: ${count}`)
                    return next()
                } else {
                    this._log(`❌ [${userId}] Denied - Requests: ${count}`)
                    return res.status(429).json({ message: 'Too Many Requests' })
                }
            } catch (err) {
                console.error('Rate limiter error:', err)
                return res.status(500).json({ message: `Internal Server Error: ${err}` })
            }
        }
    }
}

module.exports = FixedWindowRateLimiter
