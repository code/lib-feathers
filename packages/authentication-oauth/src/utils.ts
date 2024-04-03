import type { RequestHandler } from 'express'
import type { Middleware, Application as KoaApplication } from '@feathersjs/koa'

import type { ServiceOptions } from '@feathersjs/feathers'

import '@feathersjs/koa'
import '@feathersjs/express'
import expressCookieSession from 'cookie-session'
import koaCookieSession from 'koa-session'

import { AuthenticationService } from '@feathersjs/authentication'
import { GrantConfig } from 'grant'

export interface OauthSetupSettings {
  linkStrategy: string
  authService?: string
  expressSession?: RequestHandler
  koaSession?: Middleware
}

export const getGrantConfig = (service: AuthenticationService): GrantConfig => {
  const {
    app,
    configuration: { oauth }
  } = service
  // Set up all the defaults
  const port = app.get('port')
  let host = app.get('host')
  let protocol = 'https'

  // Development environments commonly run on HTTP with an extended port
  if (process.env.NODE_ENV !== 'production') {
    protocol = 'http'
    if (String(port) !== '80') {
      host += `:${port}`
    }
  }

  // omit 'redirect' and 'origins' from oauth
  const { redirect, origins, ...oauthConfig } = oauth

  const grant: GrantConfig = {
    ...oauthConfig,
    defaults: {
      prefix: '/oauth',
      origin: `${protocol}://${host}`,
      transport: 'state',
      response: ['tokens', 'raw', 'profile'],
      ...oauthConfig.defaults
    }
  }

  const getUrl = (url: string) => {
    const { defaults } = grant
    return `${defaults.origin}${defaults.prefix}/${url}`
  }

  // iterate over grant object with key and value
  for (const [name, value] of Object.entries(grant)) {
    if (name !== 'defaults') {
      value.redirect_uri = value.redirect_uri || getUrl(`${name}/callback`)
    }
  }

  return grant
}

export const setExpressParams: RequestHandler = (req, res, next) => {
  req.session.destroy ||= () => {
    req.session = null
  }

  req.feathers = {
    ...req.feathers,
    session: req.session,
    state: res.locals
  }

  next()
}

export const setKoaParams: Middleware = async (ctx, next) => {
  ctx.session.destroy ||= () => {
    ctx.session = null
  }

  ctx.feathers = {
    ...ctx.feathers,
    session: ctx.session,
    state: ctx.state
  } as any

  await next()
}

export const authenticationServiceOptions = (
  service: AuthenticationService,
  settings: OauthSetupSettings
): ServiceOptions => {
  const { secret } = service.configuration
  const koaApp = service.app as KoaApplication

  if (koaApp.context) {
    koaApp.keys = [secret]

    const { koaSession = koaCookieSession({ key: 'feathers.oauth' }, koaApp as any) } = settings

    return {
      koa: {
        before: [koaSession, setKoaParams]
      }
    }
  }

  const {
    expressSession = expressCookieSession({
      name: 'feathers.oauth',
      keys: [secret]
    })
  } = settings

  return {
    express: {
      before: [expressSession, setExpressParams]
    }
  }
}
