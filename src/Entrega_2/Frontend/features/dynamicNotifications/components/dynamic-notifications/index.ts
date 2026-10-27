import { Content } from './content';
import { Gooey } from './gooey';
import { Overlay } from './overlay';
import { Root } from './root';
import { NotificationBody } from '../ui/notification-body';

const DynamicNotifications = Object.assign(Root, {
  Overlay,
  Gooey,
  Content,
  Body: NotificationBody,
});

export { DynamicNotifications };
