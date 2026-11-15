import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('problems')
export class ProblemOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column('int')
  seq: number;

  @Index()
  @Column('uuid') ownerId: string;
  @Column({ type: 'varchar', length: 80 }) ownerName: string;

  @Index()
  @Column('boolean', { default: false }) isPublic: boolean;
  @Column('boolean', { default: false }) publicTests: boolean;
  @Column('boolean', { default: false }) publicSolution: boolean;
  /** Organizations whose teachers see the whole problem (OJ-8). */
  @Column('uuid', { array: true, default: '{}' }) sharedOrganizationIds: string[];

  @Column('uuid', { nullable: true }) copiedFromId: string | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) copiedFromCode: string | null;
  @Column({ type: 'varchar', length: 80, nullable: true }) copiedFromOwner: string | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  difficulty: string;

  @Column('text', { array: true, default: '{}' })
  tags: string[];

  @Column('text') statement: string;
  @Column('text') inputFormat: string;
  @Column('text') outputFormat: string;
  @Column('text') constraints: string;

  @Column('int') timeLimitMs: number;
  @Column('int') memoryLimitMb: number;

  @Column('text', { nullable: true }) solutionExplanation: string | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) solutionLanguage: string | null;
  @Column('text', { nullable: true }) solutionCode: string | null;

  @OneToMany(() => TestCaseOrmEntity, (t) => t.problem)
  testCases: TestCaseOrmEntity[];

  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('test_cases')
export class TestCaseOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  problemId: string;

  @ManyToOne(() => ProblemOrmEntity, (p) => p.testCases, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'problemId' })
  problem: ProblemOrmEntity;

  @Column('int') order: number;
  @Column('text') input: string;
  @Column('text') expectedOutput: string;
  @Column('boolean', { default: false }) isSample: boolean;
  @Column('real', { default: 1 }) points: number;
}
