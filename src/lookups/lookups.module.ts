import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LookupEntity } from '../database/entities/lookup.entity';
import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';

@Module({
  imports: [TypeOrmModule.forFeature([LookupEntity])],
  controllers: [LookupsController],
  providers: [LookupsService],
})
export class LookupsModule {}
