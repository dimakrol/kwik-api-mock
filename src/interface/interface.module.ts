import { Module } from '@nestjs/common';
import { InterfaceController } from './interface.controller';

@Module({
  controllers: [InterfaceController],
})
export class InterfaceModule {}
