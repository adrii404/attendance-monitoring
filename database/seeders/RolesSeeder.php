<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Role;

class RolesSeeder extends Seeder
{
    public function run(): void
    {
        $roles = ['Admin', 'CSR', 'IT', 'Technical'];

        foreach ($roles as $role) {
            Role::updateOrCreate(
                ['title' => $role],
                ['title' => $role]
            );
        }
    }
}
