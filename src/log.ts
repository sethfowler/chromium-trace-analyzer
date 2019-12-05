import pino from 'pino';

export const log = pino({
  level: 'info',
  prettyPrint: {
    colorize: true,
    ignore: 'hostname,pid,time',
    levelFirst: true
  }
}, pino.destination(2));
