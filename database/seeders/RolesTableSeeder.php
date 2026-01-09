<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RolesTableSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $roles = ['ADMIN', 'IT', 'CSR', 'TECHNICAL'];

        foreach ($roles as $role) {
            DB::table('roles')->updateOrInsert(
                ['name' => $role],  // unique key
                ['name' => $role]
            );
        }
    }
}
