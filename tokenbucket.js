class TokenBucketLimiter {
    constructor(capacity, refillRate) {
        this.capacity = capacity
        this.tokens = capacity
        this.refillRate = refillRate
        this.lastRefill = Date.now()
    }

    refill() {
        const now = Date.now()
        const elapsed = (now - this.lastRefill) / 1000
        const refillTokens = elapsed * this.refillRate

        this.tokens = Math.min(this.capacity, this.tokens + refillTokens)

        this.lastRefill = now
    }

    tryRemoveToken() {
        this.refill()

        if (this.tokens >= 1) {
            this.tokens -= 1
            return true
        }

        return false
    }
}

class RateLimiter {
    constructor(redis, options = {}) {
        this.redis = redis
        this.capacity = options.capacity ?? 3
        this.refillRate = options.refillRate ?? 1
        this.ttlMs = options.ttlMs ?? 60 * 1000
        this.debug = options.debug ?? false
    }

    _log(message) {
        if (this.debug) console.log(message)
    }

    getRedisKey(userId) {
        return `rate-limit:${userId}`
    }

    async loadLimiter(userId) {
        const key = this.getRedisKey(userId)
        const data = await this.redis.hgetall(key)

        const limiter = new TokenBucketLimiter(this.capacity, this.refillRate)
        if (Object.keys(data).length !== 0) {
            limiter.tokens = Number(data.tokens)
            limiter.lastRefill = Number(data.lastRefill)
        }

        return limiter
    }

    async saveLimiter(userId, limiter) {
        const key = this.getRedisKey(userId)
        await this.redis.hmset(key, {
            tokens: limiter.tokens,
            capacity: limiter.capacity,
            refillRate: limiter.refillRate,
            lastRefill: limiter.lastRefill,
        })
        await this.redis.pexpire(key, this.ttlMs)
    }

    getMiddleware() {
        return async (req, res, next) => {
            const userId = req.headers['x-forwarded-for'] ?? req.ip
            if (!userId) return res.status(400).json({ message: 'User ID is required' })

            try {
                const limiter = await this.loadLimiter(userId)
                const allowed = limiter.tryRemoveToken()

                const resetSeconds = Math.ceil((limiter.capacity - limiter.tokens) / limiter.refillRate)

                res.setHeader('X-RateLimit-Limit', limiter.capacity)
                res.setHeader('X-RateLimit-Remaining', Math.floor(limiter.tokens))
                res.setHeader('X-RateLimit-Reset', resetSeconds)

                await this.saveLimiter(userId, limiter)

                if (allowed) {
                    this._log(`✅ [${userId}] Allowed - Tokens left: ${limiter.tokens.toFixed(2)}`)
                    return next()
                } else {
                    this._log(`❌ [${userId}] Denied - Tokens left: ${limiter.tokens.toFixed(2)}`)
                    return res.status(429).json({ message: 'Too Many Requests' })
                }
            } catch (err) {
                console.error('Rate limiter error:', err)
                return res.status(500).json({ message: `Internal Server Error: ${err}` })
            }
        }
    }
}

module.exports = RateLimiter
